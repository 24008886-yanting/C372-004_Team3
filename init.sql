-- Create database and tables for Repawblic Pet Shop

USE repawblic_petshop;

-- Users table (stores admin, customer, adopter, shelter accounts)
CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(20),
  address VARCHAR(255),
  role ENUM('admin', 'customer', 'adopter', 'shelter') DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Products table
CREATE TABLE IF NOT EXISTS products (
  product_id INT AUTO_INCREMENT PRIMARY KEY,
  product_name VARCHAR(150) NOT NULL,
  description TEXT,
  ingredient_list TEXT,
  price INT,
  stock INT DEFAULT 0,
  category VARCHAR(100),
  image1 VARCHAR(255),
  image2 VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Shelters table
CREATE TABLE IF NOT EXISTS shelters (
  shelter_id INT AUTO_INCREMENT PRIMARY KEY,
  shelter_name VARCHAR(150) NOT NULL,
  contact_number VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Adoptions table (shelter staff logs adopter details)
CREATE TABLE IF NOT EXISTS adoptions (
  adoption_id INT AUTO_INCREMENT PRIMARY KEY,
  adopter_name VARCHAR(150),
  adopter_email VARCHAR(100),
  adopter_phone VARCHAR(20),
  pet_name VARCHAR(100),
  pet_breed VARCHAR(100),
  shelter_id INT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shelter_id) REFERENCES shelters(shelter_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cart table
CREATE TABLE IF NOT EXISTS cart (
  cart_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT DEFAULT 1,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
  UNIQUE KEY unique_cart_item (user_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Wishlist table
CREATE TABLE IF NOT EXISTS wishlist (
  wishlist_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE,
  UNIQUE KEY unique_wishlist_item (user_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vouchers table
CREATE TABLE IF NOT EXISTS vouchers (
  voucher_id INT AUTO_INCREMENT PRIMARY KEY,
  voucher_code VARCHAR(50) NOT NULL UNIQUE,
  discount_amount INT,
  description TEXT,
  max_uses INT,
  times_used INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  order_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  voucher_id INT,
  subtotal INT,
  discount_amount INT DEFAULT 0,
  shipping_fee INT DEFAULT 0,
  tax_amount INT DEFAULT 0,
  total_amount INT,
  status ENUM('pending', 'processing', 'completed', 'cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (voucher_id) REFERENCES vouchers(voucher_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Order Items table (links products to orders)
CREATE TABLE IF NOT EXISTS order_items (
  order_item_id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT DEFAULT 1,
  price_each INT,
  item_total INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  review_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  order_id INT,
  order_item_id INT,
  product_id INT NOT NULL,
  rating INT,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE SET NULL,
  FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE SET NULL,
  FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contact Messages table
CREATE TABLE IF NOT EXISTS contact_messages (
  message_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  subject VARCHAR(255),
  message_body TEXT NOT NULL,
  status ENUM('new', 'read', 'replied') DEFAULT 'new',
  admin_reply TEXT,
  replied_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample admin user (password: admin123 hashed with bcrypt)
INSERT INTO users (username, password, email, phone, address, role) 
VALUES ('admin', '$2b$10$4Dl1yQT5.J4QE8p7.X9Xk.8F.J.0.8O0pY0Z8U8O0V8W8X8Y8Z8A8B', 'admin@repawblic.com', '12345678', '123 Admin St', 'admin');

-- Insert sample products
INSERT INTO products (product_name, description, ingredient_list, price, stock, category) VALUES
('Premium Dog Food', 'High-quality dog food with chicken and vegetables', 'Chicken, Rice, Vegetables', 2999, 50, 'Food'),
('Cat Toy Ball', 'Interactive rubber ball toy for cats', 'Natural Rubber', 599, 100, 'Toys'),
('Dog Bed', 'Comfortable orthopedic dog bed', 'Memory Foam, Polyester', 9999, 25, 'Beds'),
('Fish Tank Filter', 'Powerful aquarium filter system', 'Plastic, Motor', 4999, 30, 'Accessories'),
('Bird Cage', 'Large stainless steel bird cage', 'Stainless Steel', 14999, 10, 'Cages');
