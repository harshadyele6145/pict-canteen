const express = require("express");
const crypto = require("crypto");

const router = express.Router();

const pool = require("../db");
const razorpay = require("../utils/razorpay");

/* =====================================================
   HELPERS
===================================================== */

function parsePositiveInteger(value) {
  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : null;
}

function generatePickupToken() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let token = "";

  for (let i = 0; i < 6; i++) {
    token += chars.charAt(crypto.randomInt(0, chars.length));
  }

  return token;
}

function verifyPaymentSignature(
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature
) {
  const body = `${razorpayOrderId}|${razorpayPaymentId}`;

  const expectedSignature = crypto
    .createHmac(
      "sha256",
      process.env.RAZORPAY_KEY_SECRET
    )
    .update(body)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(razorpaySignature, "utf8")
    );
  } catch {
    return false;
  }
}

/* =====================================================
   CREATE RAZORPAY ORDER

   LIVE:
   - slot_id = NULL
   - no slot validation
   - no slot booking

   PREORDER:
   - slot required
   - today's slot only
   - future slot required

   Neither mode reserves stock before payment.
===================================================== */

router.post("/create-order", async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      user_id,
      slot_id,
      items,
      order_mode,
    } = req.body;

    /* -----------------------------------------------
       VALIDATION
    ------------------------------------------------ */

    const parsedUserId =
      parsePositiveInteger(user_id);

    if (parsedUserId === null) {
      return res.status(400).json({
        message: "Valid user ID is required",
      });
    }

    if (
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        message: "Order items are required",
      });
    }

    const finalOrderMode =
      order_mode === "preorder"
        ? "preorder"
        : "live";

    /* -----------------------------------------------
       LIVE / PREORDER SLOT VALIDATION
    ------------------------------------------------ */

    let finalSlotId = null;

    if (finalOrderMode === "preorder") {
      if (!slot_id) {
        return res.status(400).json({
          message: "Pickup slot is required for preorder",
        });
      }

      finalSlotId =
        parsePositiveInteger(slot_id);

      if (finalSlotId === null) {
        return res.status(400).json({
          message: "Invalid pickup slot",
        });
      }
    }

    /* -----------------------------------------------
       START TRANSACTION
    ------------------------------------------------ */

    await client.query("BEGIN");

    /* -----------------------------------------------
       VERIFY USER
    ------------------------------------------------ */

    const userResult = await client.query(
      `
      SELECT
        id,
        name,
        email
      FROM users
      WHERE id = $1
      `,
      [parsedUserId]
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "User not found",
      });
    }

    const user = userResult.rows[0];

    /* -----------------------------------------------
       PREORDER SLOT VALIDATION

       LIVE ORDER skips this completely.
    ------------------------------------------------ */

    let slot = null;

    if (finalOrderMode === "preorder") {
      const slotResult = await client.query(
        `
        SELECT *
        FROM time_slots
        WHERE id = $1
        FOR UPDATE
        `,
        [finalSlotId]
      );

      if (slotResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message: "Pickup slot not found",
        });
      }

      slot = slotResult.rows[0];

      /* -----------------------------------------------
         TODAY CHECK
      ------------------------------------------------ */

      const todayResult = await client.query(`
        SELECT
          (
            CURRENT_TIMESTAMP
            AT TIME ZONE 'Asia/Kolkata'
          )::date AS today
      `);

      const today = todayResult.rows[0].today;

      if (
        String(slot.slot_date) !==
        String(today)
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "Only today's pickup slots are allowed",
        });
      }

      /* -----------------------------------------------
         SLOT AVAILABILITY
      ------------------------------------------------ */

      if (!slot.available) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "Pickup slot is unavailable",
        });
      }

      if (
        Number(slot.booked) >=
        Number(slot.capacity)
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "Pickup slot is full",
        });
      }

      /* -----------------------------------------------
         PREORDER MUST BE FUTURE
      ------------------------------------------------ */

      const slotStartResult = await client.query(
        `
        SELECT
          start_time,
          (
            CURRENT_TIMESTAMP
            AT TIME ZONE 'Asia/Kolkata'
          )::time AS current_time
        FROM time_slots
        WHERE id = $1
        `,
        [finalSlotId]
      );

      const slotInfo =
        slotStartResult.rows[0];

      if (
        slotInfo.start_time <=
        slotInfo.current_time
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "Preorder requires a future pickup slot",
        });
      }
    }

    /* -----------------------------------------------
       VALIDATE MENU ITEMS

       Server calculates total.
       Multiple items = ONE order.
    ------------------------------------------------ */

    let serverTotal = 0;

    const validatedItems = [];

    for (const item of items) {
      const menuItemId =
        Number(item.menu_item_id);

      const quantity =
        Number(item.quantity);

      if (
        !Number.isInteger(menuItemId) ||
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            "Invalid item or quantity",
        });
      }

      const menuResult =
        await client.query(
          `
          SELECT
            id,
            name,
            price,
            available,
            stock
          FROM menu_items
          WHERE id = $1
          `,
          [menuItemId]
        );

      if (menuResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message:
            `Menu item ${menuItemId} not found`,
        });
      }

      const menuItem =
        menuResult.rows[0];

      if (!menuItem.available) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            `${menuItem.name} is currently unavailable`,
        });
      }

      if (
        Number(menuItem.stock) < quantity
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            `${menuItem.name} has only ${menuItem.stock} available`,
        });
      }

      const itemTotal =
        Number(menuItem.price) *
        quantity;

      serverTotal += itemTotal;

      validatedItems.push({
        menu_item_id: menuItem.id,
        quantity,
        price: Number(menuItem.price),
      });
    }

    /* -----------------------------------------------
       CREATE LOCAL PAYMENT-PENDING ORDER

       LIVE:
         slot_id = NULL

       PREORDER:
         slot_id = today's selected slot
    ------------------------------------------------ */

    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    );

    const orderResult =
      await client.query(
        `
        INSERT INTO orders
        (
          user_id,
          slot_id,
          total_amount,
          status,
          payment_status,
          expires_at,
          order_mode
        )
        VALUES
        (
          $1,
          $2,
          $3,
          'PAYMENT_PENDING',
          'PENDING',
          $4,
          $5
        )
        RETURNING
          id,
          slot_id,
          total_amount,
          expires_at,
          order_mode
        `,
        [
          parsedUserId,
          finalSlotId,
          serverTotal,
          expiresAt,
          finalOrderMode,
        ]
      );

    const order =
      orderResult.rows[0];

    /* -----------------------------------------------
       SAVE ALL ORDER ITEMS

       One checkout = one order.
    ------------------------------------------------ */

    for (const item of validatedItems) {
      await client.query(
        `
        INSERT INTO order_items
        (
          order_id,
          menu_item_id,
          quantity,
          price
        )
        VALUES
        ($1, $2, $3, $4)
        `,
        [
          order.id,
          item.menu_item_id,
          item.quantity,
          item.price,
        ]
      );
    }

    /* -----------------------------------------------
       CREATE RAZORPAY ORDER
    ------------------------------------------------ */

    const razorpayOrder =
      await razorpay.orders.create({
        amount: Math.round(
          serverTotal * 100
        ),
        currency: "INR",
        receipt:
          `PICT_ORDER_${order.id}`,
        notes: {
          local_order_id:
            String(order.id),

          user_id:
            String(parsedUserId),

          slot_id:
            finalSlotId
              ? String(finalSlotId)
              : "",

          order_mode:
            finalOrderMode,
        },
      });

    /* -----------------------------------------------
       SAVE PAYMENT RECORD
    ------------------------------------------------ */

    await client.query(
      `
      INSERT INTO payments
      (
        order_id,
        amount,
        payment_method,
        transaction_id,
        gateway_order_id,
        status
      )
      VALUES
      (
        $1,
        $2,
        'RAZORPAY',
        $3,
        $4,
        'PENDING'
      )
      `,
      [
        order.id,
        serverTotal,
        razorpayOrder.id,
        razorpayOrder.id,
      ]
    );

    await client.query("COMMIT");

    /* -----------------------------------------------
       RESPONSE
    ------------------------------------------------ */

    return res.status(201).json({
      success: true,

      order_id:
        order.id,

      razorpay_order_id:
        razorpayOrder.id,

      amount:
        Math.round(
          serverTotal * 100
        ),

      currency: "INR",

      key_id:
        process.env.RAZORPAY_KEY_ID,

      customer: {
        name: user.name,
        email: user.email,
      },

      order_mode:
        finalOrderMode,

      slot_id:
        finalSlotId,

      expires_at:
        order.expires_at,
    });

  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error(
      "Create Razorpay order error:",
      error
    );

    return res.status(500).json({
      message:
        "Unable to create payment order",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

/* =====================================================
   VERIFY RAZORPAY PAYMENT

   AFTER SUCCESSFUL PAYMENT:

   - Verify signature
   - Verify amount
   - Verify currency
   - Verify captured
   - Lock order
   - Lock stock
   - Deduct stock
   - PREORDER only: book slot
   - Generate pickup token
   - ORDER = PLACED
   - PAYMENT = PAID
   - Emit new_order
===================================================== */

router.post("/verify", async (req, res) => {
  const client =
    await pool.connect();

  try {
    const {
      order_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    /* -----------------------------------------------
       VALIDATION
    ------------------------------------------------ */

    const parsedOrderId =
      parsePositiveInteger(order_id);

    if (
      parsedOrderId === null ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        message:
          "Payment verification data is incomplete",
      });
    }

    /* -----------------------------------------------
       VERIFY SIGNATURE
    ------------------------------------------------ */

    const signatureValid =
      verifyPaymentSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

    if (!signatureValid) {
      return res.status(400).json({
        message:
          "Invalid payment signature",
      });
    }

    /* -----------------------------------------------
       FETCH PAYMENT FROM RAZORPAY
    ------------------------------------------------ */

    const razorpayPayment =
      await razorpay.payments.fetch(
        razorpay_payment_id
      );

    /* -----------------------------------------------
       START TRANSACTION
    ------------------------------------------------ */

    await client.query("BEGIN");

    /* -----------------------------------------------
       LOCK LOCAL ORDER
    ------------------------------------------------ */

    const orderResult =
      await client.query(
        `
        SELECT *
        FROM orders
        WHERE id = $1
        FOR UPDATE
        `,
        [parsedOrderId]
      );

    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Order not found",
      });
    }

    const order =
      orderResult.rows[0];

    /* -----------------------------------------------
       IDEMPOTENCY
    ------------------------------------------------ */

    if (
      order.payment_status === "PAID"
    ) {
      await client.query("COMMIT");

      return res.json({
        success: true,
        already_processed: true,
        order_id: order.id,
        payment_status: "PAID",
        order_status: "PLACED",
        order_mode: order.order_mode,
        slot_id: order.slot_id,
        pickup_token:
          order.pickup_token,
        message:
          "Payment already verified",
      });
    }

    /* -----------------------------------------------
       VERIFY PAYMENT RECORD
    ------------------------------------------------ */

    const paymentResult =
      await client.query(
        `
        SELECT *
        FROM payments
        WHERE order_id = $1
          AND gateway_order_id = $2
        FOR UPDATE
        `,
        [
          order.id,
          razorpay_order_id,
        ]
      );

    if (
      paymentResult.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message:
          "Payment does not match this order",
      });
    }

    const localPayment =
      paymentResult.rows[0];

    /* -----------------------------------------------
       VERIFY RAZORPAY ORDER ID
    ------------------------------------------------ */

    if (
      localPayment.gateway_order_id !==
      razorpay_order_id
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message:
          "Invalid Razorpay order",
      });
    }

    /* -----------------------------------------------
       VERIFY AMOUNT
    ------------------------------------------------ */

    const expectedAmount =
      Math.round(
        Number(order.total_amount) *
        100
      );

    if (
      Number(razorpayPayment.amount) !==
      expectedAmount
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message:
          "Payment amount does not match order amount",
      });
    }

    /* -----------------------------------------------
       VERIFY CURRENCY
    ------------------------------------------------ */

    if (
      razorpayPayment.currency !==
      "INR"
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message:
          "Invalid payment currency",
      });
    }

    /* -----------------------------------------------
       VERIFY PAYMENT CAPTURED
    ------------------------------------------------ */

    if (
      razorpayPayment.status !==
      "captured"
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message:
          `Payment is not captured. Current status: ${razorpayPayment.status}`,
      });
    }

    /* -----------------------------------------------
       PREORDER SLOT CHECK + BOOKING

       LIVE ORDER:
       slot_id is NULL and this entire block
       is skipped.
    ------------------------------------------------ */

    let verifiedSlotId =
      order.slot_id;

    if (
      order.order_mode ===
      "preorder"
    ) {
      if (!order.slot_id) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          message:
            "Preorder order has no pickup slot",
        });
      }

      const slotResult =
        await client.query(
          `
          SELECT *
          FROM time_slots
          WHERE id = $1
          FOR UPDATE
          `,
          [order.slot_id]
        );

      if (
        slotResult.rows.length === 0
      ) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          message:
            "Pickup slot not found",
        });
      }

      const slot =
        slotResult.rows[0];

      /* Today's date */

      const todayResult =
        await client.query(`
          SELECT
            (
              CURRENT_TIMESTAMP
              AT TIME ZONE 'Asia/Kolkata'
            )::date AS today
        `);

      const today =
        todayResult.rows[0].today;

      if (
        String(slot.slot_date) !==
        String(today)
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "Only today's pickup slots are allowed",
        });
      }

      if (!slot.available) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "Pickup slot is no longer available",
        });
      }

      if (
        Number(slot.booked) >=
        Number(slot.capacity)
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            "Pickup slot became full",
        });
      }

      /* Book exactly one slot for this order */

      const slotBookResult = await client.query(
        `
        UPDATE time_slots
        SET
          booked = booked + 1,
          available =
            CASE
              WHEN booked + 1 >= capacity
              THEN false
              ELSE available
            END
        WHERE id = $1
          AND booked < capacity
        RETURNING id
        `,
        [order.slot_id]
      );

      if (slotBookResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message: "Pickup slot became full",
        });
      }
    } else {
      /* LIVE ORDER */

      verifiedSlotId = null;

      /* Safety: live orders must not have slots */

      if (order.slot_id !== null) {
        await client.query(
          `
          UPDATE orders
          SET slot_id = NULL
          WHERE id = $1
          `,
          [order.id]
        );
      }
    }

    /* -----------------------------------------------
       LOCK ORDER ITEMS + MENU STOCK
    ------------------------------------------------ */

    const orderItemsResult =
      await client.query(
        `
        SELECT
          oi.id,
          oi.menu_item_id,
          oi.quantity,
          mi.name,
          mi.stock,
          mi.available
        FROM order_items oi
        JOIN menu_items mi
          ON mi.id = oi.menu_item_id
        WHERE oi.order_id = $1
        FOR UPDATE OF mi
        `,
        [order.id]
      );

    if (
      orderItemsResult.rows.length === 0
    ) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message:
          "Order contains no items",
      });
    }

    /* -----------------------------------------------
       CHECK STOCK AGAIN
    ------------------------------------------------ */

    for (const item of
      orderItemsResult.rows) {

      if (
        !item.available ||
        Number(item.stock) <
          Number(item.quantity)
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          message:
            `${item.name} is no longer available in the required quantity`,
        });
      }
    }

    /* -----------------------------------------------
       DEDUCT STOCK
    ------------------------------------------------ */

    for (const item of
      orderItemsResult.rows) {

      const stockUpdate = await client.query(
        `
        UPDATE menu_items
        SET
          stock = stock - $1,
          available =
            CASE
              WHEN stock - $1 <= 0
              THEN false
              ELSE available
            END
        WHERE id = $2
          AND stock >= $1
        RETURNING id, stock
        `,
        [
          item.quantity,
          item.menu_item_id,
        ]
      );

      if (stockUpdate.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          message:
            `${item.name} does not have enough stock`,
        });
      }
    }

    /* -----------------------------------------------
       GENERATE UNIQUE PICKUP TOKEN
    ------------------------------------------------ */

    let pickupToken = null;

    for (
      let attempt = 0;
      attempt < 10;
      attempt++
    ) {
      const candidate =
        generatePickupToken();

      const tokenCheck =
        await client.query(
          `
          SELECT id
          FROM orders
          WHERE pickup_token = $1
          `,
          [candidate]
        );

      if (
        tokenCheck.rows.length === 0
      ) {
        pickupToken = candidate;
        break;
      }
    }

    if (!pickupToken) {
      await client.query(
        "ROLLBACK"
      );

      return res.status(500).json({
        message:
          "Unable to generate pickup token",
      });
    }

    /* -----------------------------------------------
       UPDATE PAYMENT
    ------------------------------------------------ */

    await client.query(
      `
      UPDATE payments
      SET
        gateway_payment_id = $1,
        gateway_signature = $2,
        status = 'PAID',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      `,
      [
        razorpay_payment_id,
        razorpay_signature,
        localPayment.id,
      ]
    );

    /* -----------------------------------------------
       UPDATE ORDER

       FINAL:
       payment_status = PAID
       status = PLACED
    ------------------------------------------------ */

    const updatedOrderResult =
      await client.query(
        `
        UPDATE orders
        SET
          slot_id = $1,
          payment_status = 'PAID',
          status = 'PLACED',
          pickup_token = $2,
          token_generated_at = CURRENT_TIMESTAMP,
          expires_at = NULL
        WHERE id = $3
        RETURNING *
        `,
        [
          verifiedSlotId,
          pickupToken,
          order.id,
        ]
      );

    const updatedOrder =
      updatedOrderResult.rows[0];

    /* -----------------------------------------------
       COMMIT
    ------------------------------------------------ */

    await client.query("COMMIT");

    /* -----------------------------------------------
       SOCKET EVENTS
    ------------------------------------------------ */

    const io =
      req.app.get("io");

    if (io) {
      io.emit("new_order", {
        order_id:
          updatedOrder.id,

        user_id:
          updatedOrder.user_id,

        slot_id:
          updatedOrder.slot_id,

        total_amount:
          updatedOrder.total_amount,

        status:
          "PLACED",

        payment_status:
          "PAID",

        order_mode:
          updatedOrder.order_mode,

        pickup_token:
          pickupToken,
      });

      io.emit("menu_updated");
    }

    /* -----------------------------------------------
       RESPONSE
    ------------------------------------------------ */

    return res.json({
      success: true,

      order_id:
        updatedOrder.id,

      payment_id:
        razorpay_payment_id,

      payment_status:
        "PAID",

      order_status:
        "PLACED",

      order_mode:
        updatedOrder.order_mode,

      slot_id:
        updatedOrder.slot_id,

      total_amount:
        updatedOrder.total_amount,

      pickup_token:
        pickupToken,

      message:
        "Payment verified successfully",
    });

  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error(
      "Payment verification error:",
      error
    );

    return res.status(500).json({
      message:
        "Payment verification failed",
      error: error.message,
    });
  } finally {
    client.release();
  }
});

module.exports = router;