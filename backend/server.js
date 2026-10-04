const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

require("dotenv").config();

const pool = require("./db");

const authRoutes = require("./routes/auth");
const ordersRoutes = require("./routes/orders");
const paymentsRoutes = require("./routes/payments");
const slotsRoutes = require("./routes/slots");

const app = express();

/* =====================================================
   MIDDLEWARE
===================================================== */

app.use(
  cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());

/* =====================================================
   ROUTES
===================================================== */

app.use("/api/auth", authRoutes);

app.use("/api/orders", ordersRoutes);

app.use("/api/payments", paymentsRoutes);

app.use("/api/slots", slotsRoutes);

app.get(
  "/api/analytics/monthly",
  authRoutes.verifyToken,
  authRoutes.adminOnly,
  async (req, res) => {
    try {
      const kolkataNow = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
      }).format(new Date());

      const [defaultYear, defaultMonth] =
        kolkataNow.split("-").map(Number);

      const month = Number(req.query.month ?? defaultMonth);
      const year = Number(req.query.year ?? defaultYear);

      if (
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12 ||
        !Number.isInteger(year) ||
        year < 2000
      ) {
        return res.status(400).json({
          message: "Valid month and year are required",
        });
      }

      const summaryResult = await pool.query(
        `
        SELECT
          COUNT(*) FILTER (
            WHERE payment_status = 'PAID'
          )::int AS total_paid_orders,
          COALESCE(
            SUM(total_amount) FILTER (
              WHERE payment_status = 'PAID'
            ),
            0
          )::numeric AS total_revenue,
          COUNT(*) FILTER (
            WHERE payment_status = 'PAID'
              AND status = 'COMPLETED'
          )::int AS total_completed_orders,
          COUNT(*) FILTER (
            WHERE payment_status = 'PAID'
              AND order_mode = 'live'
          )::int AS live_orders,
          COUNT(*) FILTER (
            WHERE payment_status = 'PAID'
              AND order_mode = 'preorder'
          )::int AS preorder_orders,
          COALESCE(
            SUM(total_amount) FILTER (
              WHERE payment_status = 'PAID'
                AND order_mode = 'live'
            ),
            0
          )::numeric AS live_revenue,
          COALESCE(
            SUM(total_amount) FILTER (
              WHERE payment_status = 'PAID'
                AND order_mode = 'preorder'
            ),
            0
          )::numeric AS preorder_revenue
        FROM orders o
        WHERE
          payment_status = 'PAID'
          AND (
            (o.created_at AT TIME ZONE 'Asia/Kolkata')::date >=
            make_date($1, $2, 1)
          )
          AND (
            (o.created_at AT TIME ZONE 'Asia/Kolkata')::date <
            (make_date($1, $2, 1) + INTERVAL '1 month')::date
          )
        `,
        [year, month]
      );

      const itemsSoldResult = await pool.query(
        `
        SELECT
          COALESCE(SUM(oi.quantity), 0)::int AS total_items_sold
        FROM order_items oi
        JOIN orders o
          ON o.id = oi.order_id
        WHERE
          o.payment_status = 'PAID'
          AND (
            (o.created_at AT TIME ZONE 'Asia/Kolkata')::date >=
            make_date($1, $2, 1)
          )
          AND (
            (o.created_at AT TIME ZONE 'Asia/Kolkata')::date <
            (make_date($1, $2, 1) + INTERVAL '1 month')::date
          )
        `,
        [year, month]
      );

      const summary = summaryResult.rows[0] || {};
      summary.total_items_sold =
        itemsSoldResult.rows[0]?.total_items_sold || 0;

      const dailyResult = await pool.query(
        `
        WITH calendar AS (
          SELECT
            generate_series(
              1,
              EXTRACT(DAY FROM (
                make_date($1, $2, 1) + INTERVAL '1 month' - INTERVAL '1 day'
              ))::int
            ) AS day_number
        )
        SELECT
          calendar.day_number,
          to_char(
            make_date($1, $2, calendar.day_number),
            'YYYY-MM-DD'
          ) AS date_key,
          COALESCE(COUNT(o.id) FILTER (
            WHERE o.payment_status = 'PAID'
          ), 0)::int AS orders,
          COALESCE(SUM(o.total_amount) FILTER (
            WHERE o.payment_status = 'PAID'
          ), 0)::numeric AS revenue
        FROM calendar
        LEFT JOIN orders o
          ON (
            (o.created_at AT TIME ZONE 'Asia/Kolkata')::date =
            make_date($1, $2, calendar.day_number)
          )
          AND o.payment_status = 'PAID'
        GROUP BY calendar.day_number
        ORDER BY calendar.day_number ASC
        `,
        [year, month]
      );

      const topItemsResult = await pool.query(
        `
        SELECT
          mi.name,
          SUM(oi.quantity)::int AS quantity_sold,
          COALESCE(SUM(oi.quantity * oi.price), 0)::numeric AS revenue
        FROM order_items oi
        JOIN menu_items mi
          ON mi.id = oi.menu_item_id
        JOIN orders o
          ON o.id = oi.order_id
        WHERE
          o.payment_status = 'PAID'
          AND (
            (o.created_at AT TIME ZONE 'Asia/Kolkata')::date >=
            make_date($1, $2, 1)
          )
          AND (
            (o.created_at AT TIME ZONE 'Asia/Kolkata')::date <
            (make_date($1, $2, 1) + INTERVAL '1 month')::date
          )
        GROUP BY mi.name
        ORDER BY quantity_sold DESC, revenue DESC
        LIMIT 5
        `,
        [year, month]
      );

      const totalPaidOrders = Number(summary.total_paid_orders || 0);
      const totalRevenue = Number(summary.total_revenue || 0);

      const response = {
        month,
        year,
        summary: {
          totalRevenue: Number(totalRevenue),
          totalPaidOrders,
          totalCompletedOrders: Number(summary.total_completed_orders || 0),
          liveOrders: Number(summary.live_orders || 0),
          preorderOrders: Number(summary.preorder_orders || 0),
          totalItemsSold: Number(summary.total_items_sold || 0),
          averageOrderValue:
            totalPaidOrders > 0
              ? Number(totalRevenue) / totalPaidOrders
              : 0,
          liveRevenue: Number(summary.live_revenue || 0),
          preorderRevenue: Number(summary.preorder_revenue || 0),
        },
        dailyBreakdown: dailyResult.rows.map((item) => ({
          date: item.date_key,
          day: Number(item.day_number),
          orders: Number(item.orders || 0),
          revenue: Number(item.revenue || 0),
        })),
        topItems: topItemsResult.rows.map((item) => ({
          name: item.name,
          quantitySold: Number(item.quantity_sold || 0),
          revenue: Number(item.revenue || 0),
        })),
      };

      res.json(response);
    } catch (error) {
      console.error("Monthly analytics error:", error);

      res.status(500).json({
        message: "Failed to fetch monthly analytics",
      });
    }
  }
);

/* =====================================================
   HEALTH
===================================================== */

app.get("/", (req, res) => {
  res.json({
    message: "PICT Canteen API is running",
  });
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      server: "OK",
      database: "Connected",
    });
  } catch (error) {
    console.error("Health check error:", error);

    res.status(500).json({
      server: "OK",
      database: "Disconnected",
    });
  }
});

/* =====================================================
   GET MENU
   PUBLIC
   GET /api/menu
===================================================== */

app.get("/api/menu", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        description,
        price,
        image_url,
        category,
        available,
        stock,
        created_at
      FROM menu_items
      WHERE available = TRUE
        AND stock > 0
      ORDER BY category ASC, id ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Get menu error:", error);

    res.status(500).json({
      message: "Failed to fetch menu",
      error: error.message,
    });
  }
});

/* =====================================================
   CREATE MENU ITEM
   ADMIN ONLY
   POST /api/menu
===================================================== */

app.post(
  "/api/menu",
  authRoutes.verifyToken,
  authRoutes.adminOnly,
  async (req, res) => {
    try {
      const {
        name,
        description = "",
        price,
        image_url = "",
        category = "Other",
        stock = 0,
        available = true,
      } = req.body;

      /* -----------------------------
         VALIDATE NAME
      ----------------------------- */

      if (!name || !String(name).trim()) {
        return res.status(400).json({
          message: "Food name is required",
        });
      }

      /* -----------------------------
         VALIDATE PRICE
      ----------------------------- */

      const numericPrice = Number(price);

      if (
        !Number.isFinite(numericPrice) ||
        numericPrice <= 0
      ) {
        return res.status(400).json({
          message: "Valid price is required",
        });
      }

      /* -----------------------------
         VALIDATE STOCK
      ----------------------------- */

      const numericStock = Number(stock);

      if (
        !Number.isInteger(numericStock) ||
        numericStock < 0
      ) {
        return res.status(400).json({
          message: "Stock must be a non-negative integer",
        });
      }

      /* -----------------------------
         AVAILABILITY
         Stock 0 = automatically unavailable
      ----------------------------- */

      const finalAvailable =
        numericStock > 0 && available === true;

      /* -----------------------------
         INSERT MENU ITEM
      ----------------------------- */

      const result = await pool.query(
        `
        INSERT INTO menu_items
        (
          name,
          description,
          price,
          image_url,
          category,
          available,
          stock
        )
        VALUES
        ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [
          String(name).trim(),
          String(description).trim(),
          numericPrice,
          String(image_url).trim(),
          String(category).trim(),
          finalAvailable,
          numericStock,
        ]
      );

      const item = result.rows[0];

      /* -----------------------------
         REALTIME MENU UPDATE
      ----------------------------- */

      const io = req.app.get("io");

      if (io) {
        io.emit("menu_updated", item);
      }

      return res.status(201).json({
        message: "Menu item created successfully",
        item,
      });
    } catch (error) {
      console.error("Create menu item error:", error);

      return res.status(500).json({
        message: "Failed to create menu item",
      });
    }
  }
);

/* =====================================================
   UPDATE STOCK
   ADMIN ONLY
   PUT /api/menu/:id/stock
===================================================== */

app.put(
  "/api/menu/:id/stock",
  authRoutes.verifyToken,
  authRoutes.adminOnly,
  async (req, res) => {
    try {
      const menuId = Number(req.params.id);
      const stock = Number(req.body.stock);

      if (
        !Number.isInteger(menuId) ||
        !Number.isInteger(stock) ||
        stock < 0
      ) {
        return res.status(400).json({
          message: "Invalid menu ID or stock value",
        });
      }

      const result = await pool.query(
        `
        UPDATE menu_items
        SET
          stock = $1,
          available =
            CASE
              WHEN $1 = 0 THEN false
              ELSE available
            END
        WHERE id = $2
        RETURNING *
        `,
        [stock, menuId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Menu item not found",
        });
      }

      const item = result.rows[0];

      /* -----------------------------
         REALTIME UPDATE
      ----------------------------- */

      const io = req.app.get("io");

      if (io) {
        io.emit("menu_updated", item);
      }

      res.json({
        message: "Stock updated successfully",
        item,
      });
    } catch (error) {
      console.error("Update stock error:", error);

      res.status(500).json({
        message: "Failed to update stock",
      });
    }
  }
);

/* =====================================================
   UPDATE AVAILABILITY
   ADMIN ONLY
   PUT /api/menu/:id/availability
===================================================== */

app.put(
  "/api/menu/:id/availability",
  authRoutes.verifyToken,
  authRoutes.adminOnly,
  async (req, res) => {
    try {
      const menuId = Number(req.params.id);

      const requestedAvailable =
        req.body.available === true;

      if (!Number.isInteger(menuId)) {
        return res.status(400).json({
          message: "Invalid menu ID",
        });
      }

      const result = await pool.query(
        `
        UPDATE menu_items
        SET available =
          CASE
            WHEN stock <= 0 THEN false
            ELSE $1
          END
        WHERE id = $2
        RETURNING *
        `,
        [requestedAvailable, menuId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          message: "Menu item not found",
        });
      }

      const item = result.rows[0];

      /* -----------------------------
         REALTIME UPDATE
      ----------------------------- */

      const io = req.app.get("io");

      if (io) {
        io.emit("menu_updated", item);
      }

      res.json({
        message: "Availability updated successfully",
        item,
      });
    } catch (error) {
      console.error(
        "Update availability error:",
        error
      );

      res.status(500).json({
        message: "Failed to update availability",
      });
    }
  }
);

/* =====================================================
   SOCKET.IO
===================================================== */

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
    ],
  },
});

/* =====================================================
   MAKE SOCKET.IO AVAILABLE TO ROUTES
===================================================== */

app.set("io", io);

/* =====================================================
   SOCKET CONNECTION
===================================================== */

io.on("connection", (socket) => {
  console.log(
    "🟢 Socket connected:",
    socket.id
  );

  socket.on("disconnect", () => {
    console.log(
      "🔴 Socket disconnected:",
      socket.id
    );
  });
});

/* =====================================================
   START SERVER
===================================================== */

server.listen(PORT, () => {
  console.log(
    `🚀 Server running on http://localhost:${PORT}`
  );
});