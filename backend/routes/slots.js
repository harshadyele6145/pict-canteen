const express = require("express");

const router = express.Router();

const pool = require("../db");

/* =====================================================
   GET TODAY'S PICKUP SLOTS
   GET /api/slots
===================================================== */

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        slot_time,
        slot_date,
        start_time,
        end_time,
        capacity,
        booked,

        CASE
          WHEN booked >= capacity THEN false
          ELSE available
        END AS available,

        GREATEST(
          capacity - booked,
          0
        ) AS remaining

      FROM time_slots

      WHERE slot_date = (
        CURRENT_TIMESTAMP
        AT TIME ZONE 'Asia/Kolkata'
      )::date

      ORDER BY start_time ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error(
      "Get slots error:",
      error
    );

    res.status(500).json({
      message: "Failed to fetch slots",
    });
  }
});

module.exports = router;