import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001').transform(Number),
  BASE_URL: z.string().default('http://localhost:3001'),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Twilio
  TWILIO_MASTER_ACCOUNT_SID: z.string().min(1),
  TWILIO_MASTER_AUTH_TOKEN: z.string().min(1),

  // MiniMax AI
  MINIMAX_API_KEY: z.string().min(1),

  // Clerk
  CLERK_SECRET_KEY: z.string().min(1),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_SMS_METERED_PRICE_ID: z.string().optional(),

  // Square
  SQUARE_APPLICATION_ID: z.string().optional(),
  SQUARE_APPLICATION_SECRET: z.string().optional(),
  SQUARE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().optional(),

  // Resend
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email().default('noreply@ringback.app'),

  // Axiom (optional)
  AXIOM_DATASET: z.string().optional(),
  AXIOM_TOKEN: z.string().optional(),

  // Clover (optional)
  CLOVER_APP_ID: z.string().optional(),
  CLOVER_APP_SECRET: z.string().optional(),
  CLOVER_ENVIRONMENT: z.enum(['sandbox', 'production']).optional().default('sandbox'),
  CLOVER_WEBHOOK_SECRET: z.string().optional(),

  // Toast (optional)
  TOAST_WEBHOOK_SECRET: z.string().optional(),

  // Shopify (optional)
  SHOPIFY_CLIENT_ID: z.string().optional(),
  SHOPIFY_CLIENT_SECRET: z.string().optional(),
  SHOPIFY_SCOPES: z.string().optional().default('read_products,write_products,read_orders,write_orders'),
  SHOPIFY_WEBHOOK_SECRET: z.string().optional(),

  // Frontend URL for redirects
  FRONTEND_URL: z.string().optional(),

  // Encryption
  ENCRYPTION_KEY: z.string().length(64),

  // Logging
  LOG_LEVEL: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;

  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Missing/invalid environment variables: ${missing}`);
  }

  _env = result.data;
  return _env;
}
