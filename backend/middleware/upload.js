import multer from "multer";
import createCloudinaryStorage from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = createCloudinaryStorage({
  cloudinary,
  folder: "ecommerce-products",
  allowed_formats: ["jpg", "png", "jpeg", "webp"],
});

const upload = multer({ storage });

export default upload;
