-- A staff phrase is a shortcut, so it may lead to one place only. Stop rather
-- than guess which destination to keep if a phrase already has several.
DO $$
DECLARE duplicates text;
BEGIN
  SELECT string_agg(format('"%s" (%s destinations)', phrase, destinations), ', ')
  INTO duplicates
  FROM (
    SELECT lower(regexp_replace(btrim("phrase"), '\s+', ' ', 'g')) AS phrase, count(*) AS destinations
    FROM "search_phrases"
    GROUP BY 1
    HAVING count(*) > 1
  ) found;
  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'search_phrases has phrases with more than one destination: %. Remove the extra rows in the admin (Content > Search phrases), then run migrations again.', duplicates;
  END IF;
END $$;--> statement-breakpoint
DROP INDEX "search_phrases_phrase_target_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "search_phrases_phrase_unique" ON "search_phrases" USING btree (lower("phrase"));
