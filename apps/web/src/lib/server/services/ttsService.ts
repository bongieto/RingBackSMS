import OpenAI from 'openai';
import { supabaseAdmin, VOICE_GREETINGS_BUCKET } from '../supabaseAdmin';
import { prisma } from '../db';
import { logger } from '../logger';
import { isOpenAIVoice } from '@ringback/shared-types';
import type { OpenAIVoice } from '@ringback/shared-types';

// ── OpenAI TTS client (separate from MiniMax adapter in aiClient.ts) ──

let openaiTTS: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!openaiTTS) {
    openaiTTS = new OpenAI({ apiKey: key });
  }
  return openaiTTS;
}

// ── Slot names ────────────────────────────────────────────────────────────────

export type GreetingSlot = 'default' | 'afterHours' | 'rapidRedial' | 'returning';

const SLOT_TO_TEXT_FIELD: Record<GreetingSlot, string> = {
  default: 'voiceGreeting',
  afterHours: 'voiceGreetingAfterHours',
  rapidRedial: 'voiceGreetingRapidRedial',
  returning: 'voiceGreetingReturning',
};

const SLOT_TO_URL_FIELD: Record<GreetingSlot, string> = {
  default: 'voiceAudioUrl',
  afterHours: 'voiceAudioUrlAfterHours',
  rapidRedial: 'voiceAudioUrlRapidRedial',
  returning: 'voiceAudioUrlReturning',
};

// ── Core TTS generation ───────────────────────────────────────────────────────

/**
 * Generate TTS audio via OpenAI, upload to Supabase Storage, and update
 * the tenant config with the public URL. Returns the URL or null on failure.
 */
export async function generateAndUploadGreetingAudio(params: {
  tenantId: string;
  slot: GreetingSlot;
  text: string;
  voice: OpenAIVoice;
}): Promise<string | null> {
  const { tenantId, slot, text, voice } = params;

  const openai = getOpenAIClient();
  if (!openai) {
    logger.warn('OpenAI TTS unavailable — OPENAI_API_KEY not set');
    return null;
  }
  if (!supabaseAdmin) {
    logger.warn('Supabase storage unavailable — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    return null;
  }

  try {
    // 1. Generate speech
    const response = await openai.audio.speech.create({
      model: 'tts-1-hd',
      voice,
      input: text,
      response_format: 'mp3',
    });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Upload to Supabase Storage (upsert — overwrites existing)
    const filePath = `${tenantId}/${slot}.mp3`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(VOICE_GREETINGS_BUCKET)
      .upload(filePath, buffer, {
        contentType: 'audio/mpeg',
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      logger.error('Supabase upload failed', { error: uploadError.message, tenantId, slot });
      return null;
    }

    // 3. Get public URL with cache-bust timestamp
    const { data: urlData } = supabaseAdmin.storage
      .from(VOICE_GREETINGS_BUCKET)
      .getPublicUrl(filePath);

    const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    // 4. Update tenant config with the audio URL
    await prisma.tenantConfig.update({
      where: { tenantId },
      data: { [SLOT_TO_URL_FIELD[slot]]: publicUrl },
    });

    logger.info('TTS audio generated', { tenantId, slot, voice, chars: text.length });
    return publicUrl;
  } catch (err) {
    logger.error('TTS generation failed', { err, tenantId, slot });
    return null;
  }
}

/**
 * Delete a greeting audio file from Supabase Storage and clear the URL.
 */
export async function deleteGreetingAudio(
  tenantId: string,
  slot: GreetingSlot,
): Promise<void> {
  if (!supabaseAdmin) return;

  const filePath = `${tenantId}/${slot}.mp3`;
  await supabaseAdmin.storage
    .from(VOICE_GREETINGS_BUCKET)
    .remove([filePath])
    .catch((err) => logger.warn('Failed to delete TTS audio', { err, tenantId, slot }));

  await prisma.tenantConfig.update({
    where: { tenantId },
    data: { [SLOT_TO_URL_FIELD[slot]]: null },
  });
}

/**
 * Regenerate all greeting audio for a tenant. Fires in parallel.
 * Called when voice type changes or on manual regeneration.
 */
export async function regenerateAllGreetingAudio(tenantId: string): Promise<void> {
  const config = await prisma.tenantConfig.findUnique({
    where: { tenantId },
    select: {
      voiceType: true,
      voiceGreeting: true,
      voiceGreetingAfterHours: true,
      voiceGreetingRapidRedial: true,
      voiceGreetingReturning: true,
    },
  });
  if (!config) return;

  const voice = config.voiceType;
  if (!isOpenAIVoice(voice)) return; // Polly voice — no TTS generation

  const slots: Array<{ slot: GreetingSlot; text: string | null }> = [
    { slot: 'default', text: config.voiceGreeting },
    { slot: 'afterHours', text: config.voiceGreetingAfterHours },
    { slot: 'rapidRedial', text: config.voiceGreetingRapidRedial },
    { slot: 'returning', text: config.voiceGreetingReturning },
  ];

  await Promise.allSettled(
    slots
      .filter((s) => s.text?.trim())
      .map((s) =>
        generateAndUploadGreetingAudio({
          tenantId,
          slot: s.slot,
          text: s.text!,
          voice: voice as OpenAIVoice,
        }),
      ),
  );
}

// Re-export for convenience
export { SLOT_TO_TEXT_FIELD, SLOT_TO_URL_FIELD };
