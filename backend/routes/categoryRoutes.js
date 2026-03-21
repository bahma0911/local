import express from 'express';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const categoriesPath = path.join(process.cwd(), 'data', 'categories.json');

// GET all categories
router.get('/', (req, res) => {
  fs.readFile(categoriesPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading categories.json:', err);
      return res.status(500).json({ error: 'Failed to read categories', details: err.message });
    }
    try {
      const categories = JSON.parse(data);
      res.json(categories);
    } catch (e) {
      console.error('Error parsing categories.json:', e);
      res.status(500).json({ error: 'Invalid categories data', details: e.message });
    }
  });
});

// POST add a new category
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name is required' });
  fs.readFile(categoriesPath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Failed to read categories' });
    let categories = [];
    try {
      categories = JSON.parse(data);
    } catch (e) {}
    const exists = categories.some(c => c.name.toLowerCase() === name.toLowerCase());
    if (exists) return res.status(409).json({ error: 'Category already exists' });
    const newCategory = { id: Date.now(), name };
    categories.push(newCategory);
    fs.writeFile(categoriesPath, JSON.stringify(categories, null, 2), err2 => {
      if (err2) return res.status(500).json({ error: 'Failed to save category' });
      res.status(201).json(newCategory);
    });
  });
});

// DELETE a category by id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  fs.readFile(categoriesPath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Failed to read categories' });
    let categories = [];
    try {
      categories = JSON.parse(data);
    } catch (e) {}
    const idx = categories.findIndex(c => c.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Category not found' });
    categories.splice(idx, 1);
    fs.writeFile(categoriesPath, JSON.stringify(categories, null, 2), err2 => {
      if (err2) return res.status(500).json({ error: 'Failed to delete category' });
      res.json({ success: true });
    });
  });
});

export default router;
