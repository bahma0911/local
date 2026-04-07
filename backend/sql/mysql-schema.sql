-- MySQL schema for Negadras app
-- Run this in your SQL editor or terminal after selecting the negadras_dev database.

CREATE DATABASE IF NOT EXISTS negadras_dev;
USE negadras_dev;

SHOW TABLES;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  username VARCHAR(255) NOT NULL,
  password VARCHAR(255),
  phone VARCHAR(100),
  address TEXT,
  city VARCHAR(100),
  name VARCHAR(255),
  google_id VARCHAR(255),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token VARCHAR(255),
  verification_expires DATETIME,
  reset_password_token VARCHAR(255),
  reset_password_expires DATETIME,
  role VARCHAR(50) NOT NULL DEFAULT 'customer',
  join_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shops (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  legacy_id INT UNIQUE,
  name VARCHAR(255) NOT NULL,
  logo VARCHAR(1024),
  category VARCHAR(255),
  address TEXT,
  phone VARCHAR(100),
  delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_services JSON,
  owner_username VARCHAR(255),
  owner_email VARCHAR(255),
  owner_name VARCHAR(255),
  owner_phone VARCHAR(100),
  owner_address TEXT,
  owner_password VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_shops_category (category),
  INDEX idx_shops_legacy_id (legacy_id)
);

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  details TEXT,
  price_amount DECIMAL(12,2) NOT NULL,
  price_currency VARCHAR(10) NOT NULL DEFAULT 'ETB',
  images JSON,
  `condition` ENUM('new','used'),
  `unit` ENUM('piece','kg') NOT NULL DEFAULT 'piece',
  shop_phone VARCHAR(100),
  shop_location VARCHAR(255),
  shop_id BIGINT UNSIGNED NOT NULL,
  shop_legacy_id INT,
  category VARCHAR(255),
  stock INT NOT NULL DEFAULT 0,
  status ENUM('active','draft','archived') NOT NULL DEFAULT 'draft',
  attributes JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  INDEX idx_products_category (category),
  INDEX idx_products_shop_id (shop_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(100) PRIMARY KEY,
  shop_id BIGINT UNSIGNED NOT NULL,
  fingerprint VARCHAR(255),
  customer_id VARCHAR(255) NOT NULL,
  items JSON NOT NULL,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  delivery_method ENUM('pickup','delivery') NOT NULL DEFAULT 'delivery',
  payment_status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(255) NOT NULL DEFAULT 'cash_on_delivery',
  status ENUM('pending','confirmed','picked_up','delivered','cancelled') NOT NULL DEFAULT 'pending',
  status_history JSON NOT NULL,
  customer JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  INDEX idx_orders_shop_id (shop_id),
  INDEX idx_orders_customer_id (customer_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(255) NOT NULL,
  shop_id BIGINT UNSIGNED,
  user_id BIGINT UNSIGNED NOT NULL,
  rating INT NOT NULL DEFAULT 0,
  comment TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_reviews_product_id (product_id),
  INDEX idx_reviews_shop_id (shop_id),
  INDEX idx_reviews_user_id (user_id)
);

CREATE TABLE IF NOT EXISTS carts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  items JSON NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_carts_user_id (user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  message TEXT NOT NULL,
  data JSON,
  read_flag BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_notifications_user_id (user_id)
);

CREATE TABLE IF NOT EXISTS shop_invitations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL,
  accepted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_shop_invitations_shop_id (shop_id),
  INDEX idx_shop_invitations_email (email)
);

CREATE TABLE IF NOT EXISTS advertisements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255),
  image_url VARCHAR(1024),
  link_url VARCHAR(1024),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
