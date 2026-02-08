
try {
    const authRoutes = require('./src/routes/authRoutes');
    console.log("Resolution successful:", authRoutes);
} catch (e) {
    console.error("Resolution failed:", e);
}
