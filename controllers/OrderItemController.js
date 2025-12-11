const OrderItem = require('../models/OrderItem');

// Helper: try to render an EJS view; if not available, fall back to JSON.
const renderOrJson = (res, view, payload) => {
  res.render(view, payload, (err, html) => {
    if (err) {
      return res.json(payload);
    }
    res.send(html);
  });
};

// Stores each product inside a specific order
const OrderItemController = {
  // List all order items
  listOrderItems(req, res) {
    OrderItem.getAllOrderItems((err, results) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch order items', details: err });
      renderOrJson(res, 'orderItems/list', { orderItems: results });
    });
  },

  // Get a single order item by ID
  getOrderItemById(req, res) {
    const { id } = req.params;
    OrderItem.getOrderItemById(id, (err, results) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch order item', details: err });
      if (!results || results.length === 0) return res.status(404).json({ error: 'Order item not found' });
      renderOrJson(res, 'orderItems/detail', { orderItem: results[0] });
    });
  },

  // Create a new order item (links a product to a specific order)
  addOrderItem(req, res) {
    OrderItem.addOrderItem(req.body, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to add order item', details: err });
      const order_item_id = result?.insertId;
      renderOrJson(res, 'orderItems/create-success', { message: 'Order item created', order_item_id });
    });
  },

  // Update an existing order item by ID
  updateOrderItem(req, res) {
    const { id } = req.params;
    OrderItem.updateOrderItem(id, req.body, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to update order item', details: err });
      if (result?.affectedRows === 0) return res.status(404).json({ error: 'Order item not found' });
      renderOrJson(res, 'orderItems/update-success', { message: 'Order item updated', order_item_id: id });
    });
  },

  // Delete an order item by ID
  deleteOrderItem(req, res) {
    const { id } = req.params;
    OrderItem.deleteOrderItem(id, (err, result) => {
      if (err) return res.status(500).json({ error: 'Failed to delete order item', details: err });
      if (result?.affectedRows === 0) return res.status(404).json({ error: 'Order item not found' });
      renderOrJson(res, 'orderItems/delete-success', { message: 'Order item deleted', order_item_id: id });
    });
  }
};

module.exports = OrderItemController;
