-- Price rules and tax settings are history: a change is a new row with a later
-- effective date, never an edit (T03-01, TECH-01 §1). Saved price results are
-- never edited either; the daily clean-up may delete old unreferenced ones.
CREATE FUNCTION "price_history_refuse_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is insert-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "price_rules_no_update_or_delete" BEFORE UPDATE OR DELETE ON "price_rules"
  FOR EACH ROW EXECUTE FUNCTION "price_history_refuse_change"();
--> statement-breakpoint
CREATE TRIGGER "tax_settings_no_update_or_delete" BEFORE UPDATE OR DELETE ON "tax_settings"
  FOR EACH ROW EXECUTE FUNCTION "price_history_refuse_change"();
--> statement-breakpoint
CREATE TRIGGER "price_results_no_update" BEFORE UPDATE ON "price_results"
  FOR EACH ROW EXECUTE FUNCTION "price_history_refuse_change"();
