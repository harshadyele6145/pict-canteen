const express = require("express");

const router = express.Router();

const pool = require("../db");
const authRoutes = require("./auth");

function parsePositiveInteger(value) {
  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : null;
}

async function finalizePickup({
  client,
  req,
  orderId,
  pickupToken,
}) {
  const orderResult = await client.query(
    `
    SELECT
      o.*,

      u.name AS student_name,
      u.email AS student_email,

      ts.slot_time,
      ts.slot_date,
      ts.start_time,
      ts.end_time

    FROM orders o

    JOIN users u
      ON u.id = o.user_id

    LEFT JOIN time_slots ts
      ON ts.id = o.slot_id

    WHERE o.id = $1

    FOR UPDATE OF o
    `,
    [orderId]
  );

  if (orderResult.rows.length === 0) {
    return {
      success: false,
      statusCode: 404,
      code: "UNKNOWN_ORDER",
      message: "Unknown order",
    };
  }

  const order = orderResult.rows[0];

  if (order.payment_status !== "PAID") {
    return {
      success: false,
      statusCode: 409,
      code: "UNPAID",
      message: "Payment Not Completed",
    };
  }

  if (order.status === "COMPLETED") {
    return {
      success: false,
      statusCode: 409,
      code: "ALREADY_PICKED_UP",
      message: "Order Already Picked Up",
    };
  }

  if (order.status !== "PLACED") {
    return {
      success: false,
      statusCode: 409,
      code: "UNAVAILABLE",
      message: "Order is not available for pickup",
    };
  }

  if (!order.pickup_token || order.pickup_token !== pickupToken) {
    return {
      success: false,
      statusCode: 401,
      code: "INVALID_QR",
      message: "Invalid Pickup QR",
    };
  }

  const updateResult = await client.query(
    `
    UPDATE orders
    SET
      status = 'COMPLETED'
    WHERE id = $1
    RETURNING
      id,
      user_id,
      slot_id,
      total_amount,
      status,
      payment_status,
      order_mode,
      pickup_token,
      created_at
    `,
    [orderId]
  );

  const completedOrder = updateResult.rows[0];

  const itemsResult = await client.query(
    `
    SELECT
      oi.menu_item_id,
      mi.name,
      oi.quantity,
      oi.price
    FROM order_items oi
    JOIN menu_items mi
      ON mi.id = oi.menu_item_id
    WHERE oi.order_id = $1
    ORDER BY mi.name
    `,
    [orderId]
  );

  const io = req.app.get("io");

  if (io) {
    io.emit("order_completed", completedOrder);
  }

  return {
    success: true,
    order: {
      ...completedOrder,
      student_name: order.student_name,
      student_email: order.student_email,
      slot_time: order.slot_time,
      slot_date: order.slot_date,
      start_time: order.start_time,
      end_time: order.end_time,
      items: itemsResult.rows,
    },
  };
}

/* =====================================================
   GET TODAY'S PAID ORDERS

   GET /api/orders

   ADMIN ONLY

   Includes:
   - Live Orders
   - Preorders
   - Today's orders only

   Live Orders have no slot.
===================================================== */

router.get(
  "/",
  authRoutes.verifyToken,
  authRoutes.adminOnly,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          o.id,
          o.user_id,
          o.slot_id,
          o.total_amount,
          o.status,
          o.payment_status,
          o.order_mode,
          o.pickup_token,
          o.token_generated_at,
          o.created_at,

          u.name AS student_name,
          u.email AS student_email,

          ts.slot_time,
          ts.slot_date,
          ts.start_time,
          ts.end_time,
          ts.capacity,
          ts.booked,

          COALESCE(
            json_agg(
              json_build_object(
                'menu_item_id',
                oi.menu_item_id,

                'name',
                mi.name,

                'quantity',
                oi.quantity,

                'price',
                oi.price
              )
              ORDER BY mi.name
            )
            FILTER (
              WHERE oi.id IS NOT NULL
            ),
            '[]'
          ) AS items

        FROM orders o

        JOIN users u
          ON u.id = o.user_id

        LEFT JOIN time_slots ts
          ON ts.id = o.slot_id

        LEFT JOIN order_items oi
          ON oi.order_id = o.id

        LEFT JOIN menu_items mi
          ON mi.id = oi.menu_item_id

        WHERE
          o.payment_status = 'PAID'

          AND (
            (
              o.order_mode = 'live'
              AND o.slot_id IS NULL
              AND (
                o.created_at AT TIME ZONE 'Asia/Kolkata'
              )::date = (
                CURRENT_TIMESTAMP
                AT TIME ZONE 'Asia/Kolkata'
              )::date
            )

            OR (
              o.order_mode = 'preorder'
              AND ts.slot_date = (
                CURRENT_TIMESTAMP
                AT TIME ZONE 'Asia/Kolkata'
              )::date
            )
          )

        GROUP BY
          o.id,
          u.name,
          u.email,
          ts.slot_time,
          ts.slot_date,
          ts.start_time,
          ts.end_time,
          ts.capacity,
          ts.booked

        ORDER BY
          CASE
            WHEN o.order_mode = 'live'
            THEN 0
            ELSE 1
          END,

          ts.start_time ASC NULLS LAST,

          o.id ASC
      `);

      res.json(result.rows);
    } catch (error) {
      console.error(
        "Get orders error:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch orders",
      });
    }
  }
);


/* =====================================================
   GET ALL ORDERS FOR A STUDENT - TODAY ONLY

   GET /api/orders/user/:userId

   Student:
   - Own orders only

   Admin:
   - Can access any student's orders

   IMPORTANT:
   Returns ALL paid orders made by the user today.
   Not just the latest order.
===================================================== */

router.get(
  "/user/:userId",
  authRoutes.verifyToken,
  async (req, res) => {
    try {
      const userId =
        parsePositiveInteger(
          req.params.userId
        );

      if (userId === null) {
        return res.status(400).json({
          message:
            "Invalid user ID",
        });
      }

      /* ---------------------------------------------
         STUDENT OWNERSHIP CHECK
      --------------------------------------------- */

      if (
        req.user.role !== "admin" &&
        Number(req.user.id) !== userId
      ) {
        return res.status(403).json({
          message:
            "You can only access your own orders",
        });
      }

      /* ---------------------------------------------
         TODAY'S PAID ORDERS
      --------------------------------------------- */

      const result =
        await pool.query(
          `
          SELECT

            o.id,
            o.user_id,
            o.slot_id,
            o.total_amount,
            o.status,
            o.payment_status,
            o.order_mode,
            o.pickup_token,
            o.token_generated_at,
            o.created_at,

            ts.slot_time,
            ts.slot_date,
            ts.start_time,
            ts.end_time,

            COALESCE(
              json_agg(
                json_build_object(
                  'menu_item_id',
                  oi.menu_item_id,

                  'name',
                  mi.name,

                  'quantity',
                  oi.quantity,

                  'price',
                  oi.price
                )
                ORDER BY mi.name
              )
              FILTER (
                WHERE oi.id IS NOT NULL
              ),
              '[]'
            ) AS items

          FROM orders o

          LEFT JOIN time_slots ts
            ON ts.id = o.slot_id

          LEFT JOIN order_items oi
            ON oi.order_id = o.id

          LEFT JOIN menu_items mi
            ON mi.id = oi.menu_item_id

          WHERE
            o.user_id = $1

            AND o.payment_status = 'PAID'

            AND (
              (
                o.created_at AT TIME ZONE 'Asia/Kolkata'
              )::date = (
                CURRENT_TIMESTAMP
                AT TIME ZONE 'Asia/Kolkata'
              )::date
            )

          GROUP BY
            o.id,
            ts.slot_time,
            ts.slot_date,
            ts.start_time,
            ts.end_time

          ORDER BY
            o.created_at DESC
          `,
          [userId]
        );

      res.json(result.rows);

    } catch (error) {
      console.error(
        "Get student orders error:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch student orders",
      });
    }
  }
);


/* =====================================================
   GET SINGLE ORDER

   GET /api/orders/:id

   Admin:
   - Any order

   Student:
   - Own order only
===================================================== */

router.get(
  "/:id",
  authRoutes.verifyToken,
  async (req, res) => {
    try {
      const orderId =
        parsePositiveInteger(
          req.params.id
        );

      if (orderId === null) {
        return res.status(400).json({
          message:
            "Invalid order ID",
        });
      }

      const result =
        await pool.query(
          `
          SELECT

            o.id,
            o.user_id,
            o.slot_id,
            o.total_amount,
            o.status,
            o.payment_status,
            o.order_mode,
            o.pickup_token,
            o.token_generated_at,
            o.created_at,

            u.name AS student_name,
            u.email AS student_email,

            ts.slot_time,
            ts.slot_date,
            ts.start_time,
            ts.end_time,

            COALESCE(
              json_agg(
                json_build_object(
                  'menu_item_id',
                  oi.menu_item_id,

                  'name',
                  mi.name,

                  'quantity',
                  oi.quantity,

                  'price',
                  oi.price
                )
                ORDER BY mi.name
              )
              FILTER (
                WHERE oi.id IS NOT NULL
              ),
              '[]'
            ) AS items

          FROM orders o

          JOIN users u
            ON u.id = o.user_id

          LEFT JOIN time_slots ts
            ON ts.id = o.slot_id

          LEFT JOIN order_items oi
            ON oi.order_id = o.id

          LEFT JOIN menu_items mi
            ON mi.id = oi.menu_item_id

          WHERE o.id = $1

          GROUP BY
            o.id,
            u.name,
            u.email,
            ts.slot_time,
            ts.slot_date,
            ts.start_time,
            ts.end_time
          `,
          [orderId]
        );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message:
            "Order not found",
        });
      }

      const order =
        result.rows[0];

      /* ---------------------------------------------
         STUDENT CAN ONLY ACCESS OWN ORDER
      --------------------------------------------- */

      if (
        req.user.role !== "admin" &&
        Number(req.user.id) !==
          Number(order.user_id)
      ) {
        return res.status(403).json({
          message:
            "You can only access your own order",
        });
      }

      res.json(order);

    } catch (error) {
      console.error(
        "Get single order error:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch order",
      });
    }
  }
);


/* =====================================================
   VERIFY PICKUP TOKEN

   POST /api/orders/:id/pickup

   ADMIN ONLY

   Works for BOTH:
   - Live Order
   - Preorder

   Flow:

   Student arrives
        ↓
   Admin scans QR / enters token
        ↓
   Backend verifies
        ↓
   COMPLETED
===================================================== */

router.post(
  "/:id/pickup",
  authRoutes.verifyToken,
  authRoutes.adminOnly,
  async (req, res) => {

    const client =
      await pool.connect();

    try {
      const orderId =
        parsePositiveInteger(
          req.params.id
        );

      const pickupToken =
        String(
          req.body.pickup_token || ""
        )
          .trim()
          .toUpperCase();

      /* ---------------------------------------------
         VALIDATE ORDER ID
      --------------------------------------------- */

      if (orderId === null) {
        return res.status(400).json({
          message:
            "Invalid order ID",
        });
      }

      /* ---------------------------------------------
         VALIDATE TOKEN
      --------------------------------------------- */

      if (!pickupToken) {
        return res.status(400).json({
          message:
            "Pickup token is required",
        });
      }

      await client.query("BEGIN");

      /* ---------------------------------------------
         LOCK ORDER

         LEFT JOIN because Live Order has
         slot_id = NULL.
      --------------------------------------------- */

      const outcome = await finalizePickup({
        client,
        req,
        orderId,
        pickupToken,
      });

      if (!outcome.success) {
        await client.query("ROLLBACK");

        return res.status(outcome.statusCode).json({
          code: outcome.code,
          message: outcome.message,
        });
      }

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Pickup verified successfully",
        order: outcome.order,
      });

    } catch (error) {

      try {
        await client.query(
          "ROLLBACK"
        );
      } catch {}

      console.error(
        "Pickup verification error:",
        error
      );

      res.status(500).json({
        message:
          "Pickup verification failed",
      });

    } finally {
      client.release();
    }
  }
);

router.post(
  "/pickup-token",
  authRoutes.verifyToken,
  authRoutes.adminOnly,
  async (req, res) => {
    const pickupToken = String(req.body?.pickup_token || "")
      .trim()
      .toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(pickupToken)) {
      return res.status(400).json({
        code: "INVALID_TOKEN",
        message: "Enter a valid 6-character pickup token.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const orderResult = await client.query(
        `
        SELECT id
        FROM orders
        WHERE pickup_token = $1
        LIMIT 2
        `,
        [pickupToken]
      );

      if (orderResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          code: "INVALID_TOKEN",
          message: "No order was found for that pickup token.",
        });
      }

      if (orderResult.rows.length > 1) {
        await client.query("ROLLBACK");
        console.error("Pickup token matched multiple orders.");
        return res.status(409).json({
          code: "AMBIGUOUS_TOKEN",
          message: "This pickup token is not unique. Verify the order using its QR.",
        });
      }

      const outcome = await finalizePickup({
        client,
        req,
        orderId: orderResult.rows[0].id,
        pickupToken,
      });

      if (!outcome.success) {
        await client.query("ROLLBACK");
        return res.status(outcome.statusCode).json({
          code: outcome.code,
          message: outcome.message,
        });
      }

      await client.query("COMMIT");

      return res.json({
        success: true,
        message: "Pickup verified successfully",
        order: outcome.order,
      });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Pickup token rollback error:", rollbackError);
      }

      console.error("Pickup token verification error:", error);
      return res.status(500).json({
        message: "Pickup verification failed",
      });
    } finally {
      client.release();
    }
  }
);

router.post(
  "/scan-qr",
  authRoutes.verifyToken,
  authRoutes.adminOnly,
  async (req, res) => {
    try {
      const payload = req.body?.qr ?? req.body;
      const parsedPayload =
        typeof payload === "string"
          ? JSON.parse(payload)
          : payload;

      if (
        !parsedPayload ||
        parsedPayload.type !== "PICT_CANTEEN_PICKUP"
      ) {
        return res.status(400).json({
          code: "INVALID_QR",
          message: "Invalid Pickup QR",
        });
      }

      const orderId = parsePositiveInteger(
        parsedPayload.order_id
      );
      const pickupToken = String(
        parsedPayload.pickup_token || ""
      )
        .trim()
        .toUpperCase();

      if (orderId === null || !pickupToken) {
        return res.status(400).json({
          code: "INVALID_QR",
          message: "Invalid Pickup QR",
        });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const outcome = await finalizePickup({
          client,
          req,
          orderId,
          pickupToken,
        });

        if (!outcome.success) {
          await client.query("ROLLBACK");

          return res.status(outcome.statusCode).json({
            code: outcome.code,
            message: outcome.message,
          });
        }

        await client.query("COMMIT");

        return res.json({
          success: true,
          message: "Pickup verified successfully",
          order: outcome.order,
        });
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {}

        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("QR pickup scan error:", error);

      return res.status(400).json({
        code: "INVALID_QR",
        message: "Invalid Pickup QR",
      });
    }
  }
);


module.exports = router;