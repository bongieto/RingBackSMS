-- Seed test orders for KDS view
-- Run this in Supabase SQL Editor
-- Replace TENANT_ID below with your actual tenant ID

DO $$
DECLARE
  v_tenant_id TEXT;
  v_conv1 TEXT := gen_random_uuid()::TEXT;
  v_conv2 TEXT := gen_random_uuid()::TEXT;
  v_conv3 TEXT := gen_random_uuid()::TEXT;
  v_conv4 TEXT := gen_random_uuid()::TEXT;
  v_conv5 TEXT := gen_random_uuid()::TEXT;
  v_conv6 TEXT := gen_random_uuid()::TEXT;
  v_conv7 TEXT := gen_random_uuid()::TEXT;
BEGIN
  -- Auto-detect tenant (uses first active tenant)
  SELECT id INTO v_tenant_id FROM "Tenant" WHERE "isActive" = true LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active tenant found';
  END IF;

  RAISE NOTICE 'Seeding orders for tenant: %', v_tenant_id;

  -- Create dummy conversations for the orders
  INSERT INTO "Conversation" (id, "tenantId", "callerPhone", messages, "flowType", "handoffStatus", "isActive", "createdAt", "updatedAt")
  VALUES
    (v_conv1, v_tenant_id, '+12175550201', '[]', 'ORDER', 'AI', true, NOW(), NOW()),
    (v_conv2, v_tenant_id, '+12175550202', '[]', 'ORDER', 'AI', true, NOW(), NOW()),
    (v_conv3, v_tenant_id, '+12175550203', '[]', 'ORDER', 'AI', true, NOW() - INTERVAL '10 minutes', NOW()),
    (v_conv4, v_tenant_id, '+12175550204', '[]', 'ORDER', 'AI', true, NOW() - INTERVAL '15 minutes', NOW()),
    (v_conv5, v_tenant_id, '+12175550205', '[]', 'ORDER', 'AI', true, NOW() - INTERVAL '25 minutes', NOW()),
    (v_conv6, v_tenant_id, '+12175550206', '[]', 'ORDER', 'AI', true, NOW() - INTERVAL '5 minutes', NOW()),
    (v_conv7, v_tenant_id, '+12175550207', '[]', 'ORDER', 'AI', true, NOW() - INTERVAL '30 minutes', NOW());

  -- Order 1: PENDING — just came in
  INSERT INTO "Order" (id, "tenantId", "conversationId", "callerPhone", "orderNumber", status, items, total, "pickupTime", "estimatedReadyTime", notes, "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid(), v_tenant_id, v_conv1, '+12175550201',
    'ORD-SEED-001', 'PENDING',
    '[{"menuItemId": "seed-1", "name": "Lumpia Shanghai (10pc)", "quantity": 2, "price": 8.99}, {"menuItemId": "seed-2", "name": "Pancit Bihon", "quantity": 1, "price": 11.99}]',
    29.97, '20 minutes', NOW() + INTERVAL '20 minutes',
    NULL, NOW(), NOW()
  );

  -- Order 2: PENDING — with notes
  INSERT INTO "Order" (id, "tenantId", "conversationId", "callerPhone", "orderNumber", status, items, total, "pickupTime", "estimatedReadyTime", notes, "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid(), v_tenant_id, v_conv2, '+12175550202',
    'ORD-SEED-002', 'PENDING',
    '[{"menuItemId": "seed-3", "name": "Adobo Chicken", "quantity": 1, "price": 13.99}, {"menuItemId": "seed-1", "name": "Lumpia Shanghai (10pc)", "quantity": 3, "price": 8.99}]',
    40.96, '30 minutes', NOW() + INTERVAL '30 minutes',
    'Extra sauce on the adobo please', NOW() - INTERVAL '2 minutes', NOW()
  );

  -- Order 3: CONFIRMED — accepted, not started cooking yet
  INSERT INTO "Order" (id, "tenantId", "conversationId", "callerPhone", "orderNumber", status, items, total, "pickupTime", "estimatedReadyTime", notes, "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid(), v_tenant_id, v_conv3, '+12175550203',
    'ORD-SEED-003', 'CONFIRMED',
    '[{"menuItemId": "seed-2", "name": "Pancit Bihon", "quantity": 2, "price": 11.99}, {"menuItemId": "seed-4", "name": "Ube Leche Flan", "quantity": 2, "price": 6.99}]',
    37.96, '15 minutes', NOW() + INTERVAL '5 minutes',
    NULL, NOW() - INTERVAL '10 minutes', NOW()
  );

  -- Order 4: PREPARING — currently cooking
  INSERT INTO "Order" (id, "tenantId", "conversationId", "callerPhone", "orderNumber", status, items, total, "pickupTime", "estimatedReadyTime", notes, "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid(), v_tenant_id, v_conv4, '+12175550204',
    'ORD-SEED-004', 'PREPARING',
    '[{"menuItemId": "seed-1", "name": "Lumpia Shanghai (10pc)", "quantity": 5, "price": 8.99}, {"menuItemId": "seed-2", "name": "Pancit Bihon", "quantity": 3, "price": 11.99}]',
    80.92, 'ASAP', NOW() + INTERVAL '8 minutes',
    'Large party order — call when ready', NOW() - INTERVAL '15 minutes', NOW()
  );

  -- Order 5: PREPARING — overdue (estimated ready time in the past)
  INSERT INTO "Order" (id, "tenantId", "conversationId", "callerPhone", "orderNumber", status, items, total, "pickupTime", "estimatedReadyTime", notes, "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid(), v_tenant_id, v_conv5, '+12175550205',
    'ORD-SEED-005', 'PREPARING',
    '[{"menuItemId": "seed-3", "name": "Adobo Chicken", "quantity": 2, "price": 13.99}, {"menuItemId": "seed-4", "name": "Ube Leche Flan", "quantity": 1, "price": 6.99}]',
    34.97, '10 minutes', NOW() - INTERVAL '5 minutes',
    NULL, NOW() - INTERVAL '25 minutes', NOW()
  );

  -- Order 6: READY — waiting for pickup
  INSERT INTO "Order" (id, "tenantId", "conversationId", "callerPhone", "orderNumber", status, items, total, "pickupTime", "estimatedReadyTime", notes, "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid(), v_tenant_id, v_conv6, '+12175550206',
    'ORD-SEED-006', 'READY',
    '[{"menuItemId": "seed-1", "name": "Lumpia Shanghai (10pc)", "quantity": 1, "price": 8.99}]',
    8.99, 'Now', NOW() - INTERVAL '2 minutes',
    NULL, NOW() - INTERVAL '12 minutes', NOW()
  );

  -- Order 7: READY — been waiting a while
  INSERT INTO "Order" (id, "tenantId", "conversationId", "callerPhone", "orderNumber", status, items, total, "pickupTime", "estimatedReadyTime", notes, "createdAt", "updatedAt")
  VALUES (
    gen_random_uuid(), v_tenant_id, v_conv7, '+12175550207',
    'ORD-SEED-007', 'READY',
    '[{"menuItemId": "seed-2", "name": "Pancit Bihon", "quantity": 1, "price": 11.99}, {"menuItemId": "seed-3", "name": "Adobo Chicken", "quantity": 1, "price": 13.99}, {"menuItemId": "seed-4", "name": "Ube Leche Flan", "quantity": 3, "price": 6.99}]',
    46.95, '15 minutes', NOW() - INTERVAL '10 minutes',
    'Birthday order — add a candle if possible!', NOW() - INTERVAL '30 minutes', NOW()
  );

  RAISE NOTICE 'Seeded 7 orders: 2 PENDING, 1 CONFIRMED, 2 PREPARING (1 overdue), 2 READY';
END $$;
