const express = require("express");
const cors = require("cors");

const db = require("./db");
const warkariRoutes = require("./routes/warkari");
const doctorRoutes = require("./routes/doctor");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/warkari", warkariRoutes);
app.use("/api/doctor", doctorRoutes);

app.get("/", (req, res) => {
    res.json({
        message: "Wari Health Passport Backend is Running!"
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
});