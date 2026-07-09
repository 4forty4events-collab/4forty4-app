-- B2 multi-keyword breadth: each sector carries its own keyword + category, so a
-- breadth run seeds the neighborhood x keyword cross-product (food, cafes, hotels,
-- culture, outdoor, activities) while the one-sector-per-tick orchestration is
-- unchanged. Null = fall back to the run-level keyword/category (single-keyword runs).
alter table harvest_sectors add column if not exists keyword text;
alter table harvest_sectors add column if not exists category text;
