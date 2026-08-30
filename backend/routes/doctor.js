const express = require("express");
const router = express.Router();

const db = require("../db");

// Doctor Login
router.post("/login", (req, res) => {

    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            message: "Username and password are required"
        });
    }

    const query = `
        SELECT doctor_id, name, specialization, contact_number, camp_id
        FROM doctor
        WHERE username = ? AND password = ?
    `;

    db.query(query, [username, password], (err, result) => {

        if (err) {
            console.error(err);
            return res.status(500).json({
                message: "Database error"
            });
        }

        if (result.length === 0) {
            return res.status(401).json({
                message: "Invalid username or password"
            });
        }

        res.json({
            message: "Login successful",
            doctor: result[0]
        });
    });
});

module.exports = router;