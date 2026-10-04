const express = require("express");

const router = express.Router();

const pool = require("../db");
const authRoutes = require("./auth");

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
            o.order_mode = 'live'

            OR (
              ts.slot_date = (
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
        Number(req.params.userId);

      if (!Number.isInteger(userId)) {
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
        Number(req.params.id);

      if (!Number.isInteger(orderId)) {
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
        Number(req.params.id);

      const pickupToken =
        String(
          req.body.pickup_token || ""
        )
          .trim()
          .toUpperCase();

      /* ---------------------------------------------
         VALIDATE ORDER ID
      --------------------------------------------- */

      if (
        !Number.isInteger(orderId)
      ) {
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

      const orderResult =
        await client.query(
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

      if (
        orderResult.rows.length === 0
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(404).json({
          message:
            "Order not found",
        });
      }

      const order =
        orderResult.rows[0];

      /* ---------------------------------------------
         PAYMENT CHECK
      --------------------------------------------- */

      if (
        order.payment_status !==
        "PAID"
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          message:
            "Order payment is not completed",
        });
      }

      /* ---------------------------------------------
         STATUS CHECK
      --------------------------------------------- */

      if (
        order.status ===
        "COMPLETED"
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          message:
            "This order has already been picked up",
        });
      }

      if (
        order.status !==
        "PLACED"
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(409).json({
          message:
            "Order is not available for pickup",
        });
      }

      /* ---------------------------------------------
         TOKEN CHECK
      --------------------------------------------- */

      if (
        !order.pickup_token ||
        order.pickup_token !==
          pickupToken
      ) {
        await client.query(
          "ROLLBACK"
        );

        return res.status(401).json({
          message:
            "Invalid pickup token",
        });
      }

      /* ---------------------------------------------
         MARK COMPLETED
      --------------------------------------------- */

      const updateResult =
        await client.query(
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

      const completedOrder =
        updateResult.rows[0];

      await client.query(
        "COMMIT"
      );

      /* ---------------------------------------------
         REAL-TIME EVENT
      --------------------------------------------- */

      const io =
        req.app.get("io");

      if (io) {
        io.emit(
          "order_completed",
          completedOrder
        );
      }

      res.json({
        success: true,

        message:
          "Pickup verified successfully",

        order:
          completedOrder,
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


module.exports = router;