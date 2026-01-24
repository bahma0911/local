import React from "react";
import "./CategoryFilter.css"; // Add this line

const CategoryFilter = ({ categories, selectedCategory, onSelect }) => {
  return (
    <div className="category-filter">
      <h3 className="category-filter-title">Filter by Category:</h3>
      <div className="category-buttons">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            className={`category-button ${selectedCategory === cat ? 'active' : ''} ${cat === 'All' ? 'all' : ''}`}
          >
            {cat}
          </button>
        ))}
      </div>
    </div>
  );
};

export default CategoryFilter;