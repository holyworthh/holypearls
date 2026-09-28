-- Help request references (HR-2026-0311): one sequence, formatted in the service.
CREATE SEQUENCE "help_request_number_seq" START 1;
--> statement-breakpoint
-- Staff replies are history and never change.
CREATE FUNCTION "help_replies_refuse_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'help_replies is insert-only: % is not allowed', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "help_replies_no_update" BEFORE UPDATE ON "help_replies"
  FOR EACH ROW EXECUTE FUNCTION "help_replies_refuse_change"();
