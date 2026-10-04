const express = require("express");

const router = express.Router();

const pool = require("../db");

/* =====================================================
   ENSURE TODAY'S PICKUP SLOTS EXIST
   08:00 AM → 06:00 PM
   Every 15 minutes = 40 slots
===================================================== */

const ensureTodaySlots = async () => {
  await pool.query(`
    INSERT INTO time_slots
    (
      slot_time,
      slot_date,
      start_time,
      end_time,
      capacity,
      booked,
      available
    )
    SELECT
      TO_CHAR(t, 'HH12:MI AM') || ' - ' ||
      TO_CHAR(
        t + INTERVAL '15 minutes',
        'HH12:MI AM'
      ),
      (
        CURRENT_TIMESTAMP
        AT TIME ZONE 'Asia/Kolkata'
      )::date,
      t::time,
      (t + INTERVAL '15 minutes')::time,
      10,
      0,
      TRUE
    FROM generate_series(
      (
        CURRENT_TIMESTAMP
        AT TIME ZONE 'Asia/Kolkata'
      )::date + TIME '08:00',

      (
        CURRENT_TIMESTAMP
        AT TIME ZONE 'Asia/Kolkata'
      )::date + TIME '17:45',

      INTERVAL '15 minutes'
    ) AS t

    ON CONFLICT (slot_date, start_time)
    DO NOTHING;
  `);
};

/* =====================================================
   GET TODAY'S PICKUP SLOTS
   GET /api/slots
===================================================== */

router.get("/", async (req, res) => {
  try {
    // Automatically create today's slots if missing
    await ensureTodaySlots();

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
      error: error.message,
    });
  }
});

module.exports = router;