-- Gallery support for scraped venues: up to 20 R2-hosted images per venue.
-- cover_image_url stays the hero (first) image; image_urls is the ordered gallery.
alter table venues add column if not exists image_urls text[];
