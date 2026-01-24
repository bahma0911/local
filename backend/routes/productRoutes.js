import express from "express";
import upload from "../middleware/upload.js";

const router = express.Router();

router.post("/create", upload.single("image"), async (req, res) => {
  try {
    const product = {
      name: req.body.name,
      price: req.body.price,
      image: req.file.path, // Cloudinary URL
    };

    // save product to database here
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Image upload failed" });
  }
});

export default router;
