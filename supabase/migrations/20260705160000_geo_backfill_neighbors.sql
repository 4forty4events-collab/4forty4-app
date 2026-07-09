-- Backfill v2: purge NEIGHBOR-country venues the first geo-backfill missed. The
-- first pass (20260705140000) rejected only coordinates OUTSIDE Algeria's national
-- bbox -- but that rectangle OVERLAPS southern Spain (Almeria ~36.8N), Gibraltar,
-- and northern Morocco, so venues there have in-box coordinates and survived. Their
-- ADDRESS, however, plainly ends with the foreign country. The ingest guard now
-- rejects on address-country too; this removes the ones already written.
--
-- Match a foreign country as the FINAL token of the address (\m = word start,
-- anchored at end). This spares legit Algerian rows whose address omits the country
-- ("Rue X, Kouba") or ends in Algeria/Algerie, and does NOT false-trigger on a
-- mid-address street name like "Rue de France, Alger, Algeria".
-- FK-safe: dependent events first (scraped venues have none), then venues.
do $$
declare
  v_count integer;
  v_re text := '\m(united states|usa|canada|united kingdom|england|scotland|wales|ireland|france|spain|espana|portugal|italy|italia|germany|deutschland|belgium|netherlands|switzerland|austria|poland|greece|turkey|turkiye|russia|ukraine|china|japan|south korea|korea|india|pakistan|indonesia|malaysia|thailand|vietnam|philippines|australia|new zealand|brazil|argentina|mexico|panama|chile|colombia|peru|egypt|saudi arabia|qatar|united arab emirates|uae|kuwait|bahrain|oman|jordan|lebanon|israel|morocco|maroc|tunisia|tunisie|libya|mali|niger|mauritania|western sahara|gibraltar|nigeria|kenya|south africa|ghana|senegal)[[:space:].,]*$';
begin
  create temporary table _geo_bad2 on commit drop as
  select id from public.venues
  where market in ('DZ','ZW') and address is not null and address ~* v_re;

  select count(*) into v_count from _geo_bad2;

  delete from public.events where venue_id in (select id from _geo_bad2);
  delete from public.venues where id       in (select id from _geo_bad2);

  raise notice 'geo-backfill v2 (neighbors): removed % foreign-address venue(s)', v_count;
end $$;
