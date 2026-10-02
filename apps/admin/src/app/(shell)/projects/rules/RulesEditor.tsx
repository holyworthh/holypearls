"use client";

import {
  ApiError,
  NOT_SURE,
  PROJECT_QUESTIONS,
  PROJECT_TYPE_INFO,
  PROJECT_TYPES,
  type ProjectQuestion,
  type ProjectRecommendation,
  projectRecommendationSchema,
  RECOMMENDATION_GROUP_LABEL,
  type RecommendationGroup,
  type RecommendationRuleSet,
  recommendationRuleSetSchema,
  type RuleCondition,
  type RuleQuantity,
  type SaveRecommendationRules,
} from "@holypearls/contracts";
import { Button, Checkbox, FormField, Notice, StatusChip, TextArea, TextField } from "@holypearls/ui";
import { api, errorCode } from "@holypearls/web-kit/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import styles from "../../admin-list.module.css";

/*
 * Recommendation rules editor (Pen 110 · khFI5: rules LQ1pJ, states ac0rA;
 * PROJ-FR-003–004). Each rule: group, product or described item, when it
 * applies, how many, and the reason customers see. Saving keeps rule ids, so
 * a customer's choices about a suggestion survive the edit.
 */

type Draft = SaveRecommendationRules["rules"][number] & { key: string };

const GROUPS: RecommendationGroup[] = ["RECOMMENDED", "USEFUL", "OPTIONAL"];
const OPS = [">", ">=", "<", "<="] as const;

const toDraft = (set: RecommendationRuleSet): Draft[] =>
  set.rules.map(({ id, group, productSlug, itemName, condition, quantity, reason, active }) => ({ key: id, id, group, productSlug, itemName, condition, quantity, reason, active }));

function describeCondition(condition: RuleCondition, questions: ProjectQuestion[]) {
  if (condition.kind === "ALWAYS") return "Always";
  const question = questions.find((item) => item.key === condition.field);
  if (condition.kind === "NUMBER") return `${question && question.kind === "NUMBER" ? question.unit[0]!.toUpperCase() + question.unit.slice(1) : condition.field} ${condition.op} ${condition.value.toLocaleString("en-NG")}`;
  const option =
    question && (question.kind === "CHOICE" || question.kind === "MULTI") ? question.options.find((item) => item.value === condition.equals)?.label : { YES: "Yes", NO: "No", [NOT_SURE]: "Not sure" }[condition.equals];
  return `${question?.label ?? condition.field} ${option ?? condition.equals}`;
}

function describeQuantity(quantity: RuleQuantity, questions: ProjectQuestion[]) {
  if (quantity.kind === "FIXED") return `${quantity.value.toLocaleString("en-NG")} (fixed)`;
  if (quantity.kind === "AFTER_REVIEW") return "After review";
  const question = questions.find((item) => item.key === quantity.field);
  const unit = question && question.kind === "NUMBER" ? question.unit : quantity.field;
  return quantity.factor === 1 ? `1 per ${unit.replace(/s$/, "")}` : `${unit[0]!.toUpperCase()}${unit.slice(1)} × ${quantity.factor}`;
}

export function RulesEditor({ initial }: { initial: RecommendationRuleSet }) {
  const router = useRouter();
  const type = initial.projectType;
  const own = PROJECT_QUESTIONS[type];
  const questions = [...own.project, ...own.scale];
  const numberQuestions = questions.filter((question): question is Extract<ProjectQuestion, { kind: "NUMBER" }> => question.kind === "NUMBER");
  const answerQuestions = questions.filter((question) => question.kind === "CHOICE" || question.kind === "MULTI" || question.kind === "YES_NO");

  const [set, setSet] = useState(initial);
  const [rules, setRules] = useState<Draft[]>(() => toDraft(initial));
  const [editing, setEditing] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, number>>(() => Object.fromEntries(numberQuestions.slice(0, 1).map((question) => [question.key, 250])));
  const [preview, setPreview] = useState<ProjectRecommendation[] | null>(null);
  const firstNumber = numberQuestions[0];

  const update = (index: number, change: Partial<Draft>) => {
    setSaved(false);
    setRules((current) => current.map((rule, position) => (position === index ? { ...rule, ...change } : rule)));
  };

  const addRule = () => {
    setSaved(false);
    setRules((current) => [
      ...current,
      { key: `new-${crypto.randomUUID()}`, group: "RECOMMENDED", productSlug: null, itemName: "", condition: { kind: "ALWAYS" }, quantity: { kind: "AFTER_REVIEW" }, reason: "", active: true },
    ]);
    setEditing(rules.length);
  };

  const removeRule = (index: number) => {
    setSaved(false);
    setRules((current) => current.filter((_, position) => position !== index));
    setEditing(null);
  };

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= rules.length) return;
    setSaved(false);
    setRules((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setEditing(target);
  };

  const save = async () => {
    setBusy(true);
    setFailure(null);
    setErrors({});
    try {
      const next = await api(`/v1/admin/recommendation-rules/${type}`, {
        method: "PUT",
        body: { version: set.version, rules: rules.map(({ key: _key, ...rule }) => (void _key, rule)) },
        response: recommendationRuleSetSchema,
      });
      setSet(next);
      setRules(toDraft(next));
      setSaved(true);
      setEditing(null);
    } catch (problem) {
      const code = errorCode(problem);
      if (problem instanceof ApiError && problem.body.fieldErrors) {
        setErrors(problem.body.fieldErrors);
        setFailure("Some rules need fixing. They're marked below.");
      } else if (code === "VERSION_CONFLICT") setFailure("Someone else saved these rules first. Reload to see their changes, then save again.");
      else if (code === "FORBIDDEN") setFailure("Your staff permissions don't include QUOTE_MANAGE.");
      else setFailure("We couldn't save the rules. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setPreview(null);
    try {
      const result = await api(`/v1/admin/recommendation-rules/${type}/preview`, { method: "POST", body: { answers: previewAnswers }, response: z.object({ items: z.array(projectRecommendationSchema) }) });
      setPreview(result.items);
    } catch {
      setFailure("We couldn't run the preview. Save first if you changed rules, then try again.");
    }
  };

  const ruleError = (index: number) => Object.entries(errors).filter(([key]) => key.startsWith(`rules.${index}.`));
  const rule = editing === null ? null : rules[editing];
  const active = rules.filter((item) => item.active).length;

  return (
    <>
      <div className={styles.filters}>
        <label className={styles.select}>
          <span className="hp-visually-hidden">Project type</span>
          <select value={type} onChange={(event) => router.push(`/projects/rules?type=${event.target.value}`)}>
            {PROJECT_TYPES.map((item) => (
              <option key={item} value={item}>
                {PROJECT_TYPE_INFO[item].label}
              </option>
            ))}
          </select>
        </label>
        <StatusChip tone={active ? "success" : "neutral"}>{active === 1 ? "1 rule active" : `${active} rules active`}</StatusChip>
        <span className={styles.hint}>Customers see these as grouped suggestions with a reason.</span>
        <span className={styles.spacer} />
        <Button type="button" variant="secondary" onClick={runPreview}>
          Preview{firstNumber ? ` with ${(previewAnswers[firstNumber.key] ?? 0).toLocaleString("en-NG")} ${firstNumber.unit}` : ""}
        </Button>
        <Button type="button" loading={busy} onClick={save}>
          Save rules
        </Button>
      </div>

      {saved ? (
        <Notice tone="success" title="Rules saved" live>
          <p>Customers see the new suggestions the next time they change their project. Their own choices are kept.</p>
        </Notice>
      ) : null}
      {failure ? (
        <Notice tone="error" title="Not saved" live>
          <p>{failure}</p>
        </Notice>
      ) : null}

      <div className={styles.columns}>
        <div className={styles.tableCol}>
          {rules.length ? (
            <table className={styles.table}>
              <caption className="hp-visually-hidden">Recommendation rules for {PROJECT_TYPE_INFO[type].label}</caption>
              <thead>
                <tr>
                  <th scope="col">GROUP</th>
                  <th scope="col">SUGGEST</th>
                  <th scope="col">WHEN</th>
                  <th scope="col">QUANTITY</th>
                  <th scope="col">REASON SHOWN TO CUSTOMER</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((item, index) => (
                  <tr key={item.key} className={editing === index ? styles.selected : undefined}>
                    <td>{RECOMMENDATION_GROUP_LABEL[item.group]}</td>
                    <td>
                      <button type="button" className={styles.action} onClick={() => setEditing(index)} aria-label={`Edit rule: ${item.itemName || "new rule"}`}>
                        <strong className={styles.strong}>{item.itemName || "New rule"}</strong>
                      </button>
                      {!item.active ? <span className={styles.hint}> · off</span> : null}
                      {ruleError(index).length ? (
                        <span className={styles.hint} role="alert">
                          {" "}
                          · needs fixing
                        </span>
                      ) : null}
                    </td>
                    <td>{describeCondition(item.condition, questions)}</td>
                    <td>{describeQuantity(item.quantity, questions)}</td>
                    <td className={styles.hint}>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.panel}>
              <h2 className={styles.panelTitle}>No rules for this project type</h2>
              <p className={styles.hint}>Customers will see &ldquo;Add what you need&rdquo; instead of suggestions.</p>
            </div>
          )}
          <div className={styles.panelActions}>
            <Button type="button" variant="secondary" onClick={addRule}>
              Add rule
            </Button>
          </div>
          <p className={styles.hint}>Customer edits win: a suggestion the customer removed stays removed, and their changed quantity is kept, when details change later.</p>
          {set.updatedAt ? (
            <p className={styles.hint}>
              Last saved by {set.updatedBy ?? "staff"} on {new Date(set.updatedAt).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          ) : null}
        </div>

        <aside className={styles.detailCol} aria-label="Edit rule and preview">
          {rule && editing !== null ? (
            <form
              className={styles.panel}
              onSubmit={(event) => {
                event.preventDefault();
                setEditing(null);
              }}
            >
              <h2 className={styles.panelTitle}>Edit rule · {rule.itemName || "new rule"}</h2>
              {ruleError(editing).map(([key, message]) => (
                <p key={key} className={styles.hint} role="alert">
                  {message}
                </p>
              ))}
              <FormField id="rule-name" label="Item customers see" error={errors[`rules.${editing}.itemName`]}>
                <TextField value={rule.itemName} maxLength={120} onChange={(event) => update(editing, { itemName: event.target.value })} />
              </FormField>
              <FormField id="rule-product" label="Product" hint="Leave as a described item when it isn't in the catalogue; staff quote it." error={errors[`rules.${editing}.productSlug`]}>
                <select className={styles.selectInput} value={rule.productSlug ?? ""} onChange={(event) => update(editing, { productSlug: event.target.value || null })}>
                  <option value="">Described item (no product)</option>
                  {set.products.map((product) => (
                    <option key={product.slug} value={product.slug}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField id="rule-group" label="Group">
                <select className={styles.selectInput} value={rule.group} onChange={(event) => update(editing, { group: event.target.value as RecommendationGroup })}>
                  {GROUPS.map((group) => (
                    <option key={group} value={group}>
                      {RECOMMENDATION_GROUP_LABEL[group]}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField id="rule-when" label="Show when" error={errors[`rules.${editing}.condition`]}>
                <select
                  className={styles.selectInput}
                  value={rule.condition.kind}
                  onChange={(event) => {
                    const kind = event.target.value;
                    const number = numberQuestions[0];
                    const answer = answerQuestions[0];
                    update(editing, {
                      condition:
                        kind === "NUMBER" && number
                          ? { kind: "NUMBER", field: number.key, op: ">", value: 0 }
                          : kind === "ANSWER" && answer
                            ? { kind: "ANSWER", field: answer.key, equals: answer.kind === "YES_NO" ? "YES" : (answer.options[0]?.value ?? "") }
                            : { kind: "ALWAYS" },
                    });
                  }}
                >
                  <option value="ALWAYS">Always</option>
                  {numberQuestions.length ? <option value="NUMBER">A number answer is…</option> : null}
                  {answerQuestions.length ? <option value="ANSWER">An answer is chosen…</option> : null}
                </select>
              </FormField>
              {rule.condition.kind === "NUMBER" ? (
                <div className={styles.filters}>
                  <label className={styles.select}>
                    <span className="hp-visually-hidden">Question</span>
                    <select value={rule.condition.field} onChange={(event) => update(editing, { condition: { ...(rule.condition as Extract<RuleCondition, { kind: "NUMBER" }>), field: event.target.value } })}>
                      {numberQuestions.map((question) => (
                        <option key={question.key} value={question.key}>
                          {question.unit}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.select}>
                    <span className="hp-visually-hidden">Comparison</span>
                    <select value={rule.condition.op} onChange={(event) => update(editing, { condition: { ...(rule.condition as Extract<RuleCondition, { kind: "NUMBER" }>), op: event.target.value as (typeof OPS)[number] } })}>
                      {OPS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </label>
                  <TextField
                    aria-label="Value"
                    inputMode="numeric"
                    value={String(rule.condition.value)}
                    onChange={(event) => update(editing, { condition: { ...(rule.condition as Extract<RuleCondition, { kind: "NUMBER" }>), value: Number(event.target.value.replace(/\D/g, "")) || 0 } })}
                  />
                </div>
              ) : null}
              {rule.condition.kind === "ANSWER"
                ? (() => {
                    const condition = rule.condition;
                    const question = answerQuestions.find((item) => item.key === condition.field) ?? answerQuestions[0]!;
                    const options = question.kind === "YES_NO" ? [{ value: "YES", label: "Yes" }, { value: "NO", label: "No" }] : "options" in question ? question.options : [];
                    return (
                      <div className={styles.filters}>
                        <label className={styles.select}>
                          <span className="hp-visually-hidden">Question</span>
                          <select
                            value={condition.field}
                            onChange={(event) => {
                              const next = answerQuestions.find((item) => item.key === event.target.value)!;
                              update(editing, { condition: { kind: "ANSWER", field: next.key, equals: next.kind === "YES_NO" ? "YES" : "options" in next ? (next.options[0]?.value ?? "") : "" } });
                            }}
                          >
                            {answerQuestions.map((item) => (
                              <option key={item.key} value={item.key}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.select}>
                          <span className="hp-visually-hidden">Answer</span>
                          <select value={condition.equals} onChange={(event) => update(editing, { condition: { ...condition, equals: event.target.value } })}>
                            {options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    );
                  })()
                : null}
              <FormField id="rule-quantity" label="Quantity" error={errors[`rules.${editing}.quantity`]}>
                <select
                  className={styles.selectInput}
                  value={rule.quantity.kind}
                  onChange={(event) => {
                    const kind = event.target.value;
                    update(editing, {
                      quantity: kind === "FIXED" ? { kind: "FIXED", value: 1 } : kind === "PER" && numberQuestions[0] ? { kind: "PER", field: numberQuestions[0].key, factor: 1 } : { kind: "AFTER_REVIEW" },
                    });
                  }}
                >
                  <option value="FIXED">A fixed number</option>
                  {numberQuestions.length ? <option value="PER">Per answer (for example 1 per guest)</option> : null}
                  <option value="AFTER_REVIEW">Staff confirm after review</option>
                </select>
              </FormField>
              {rule.quantity.kind === "FIXED" ? (
                <TextField aria-label="Fixed quantity" inputMode="numeric" value={String(rule.quantity.value)} onChange={(event) => update(editing, { quantity: { kind: "FIXED", value: Math.max(1, Number(event.target.value.replace(/\D/g, "")) || 1) } })} />
              ) : null}
              {rule.quantity.kind === "PER" ? (
                <div className={styles.filters}>
                  <label className={styles.select}>
                    <span className="hp-visually-hidden">Per answer to</span>
                    <select value={rule.quantity.field} onChange={(event) => update(editing, { quantity: { ...(rule.quantity as Extract<RuleQuantity, { kind: "PER" }>), field: event.target.value } })}>
                      {numberQuestions.map((question) => (
                        <option key={question.key} value={question.key}>
                          per {question.unit.replace(/s$/, "")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <TextField
                    aria-label="Multiply by"
                    inputMode="decimal"
                    value={String(rule.quantity.factor)}
                    onChange={(event) => update(editing, { quantity: { ...(rule.quantity as Extract<RuleQuantity, { kind: "PER" }>), factor: Number(event.target.value) > 0 ? Number(event.target.value) : 1 } })}
                  />
                </div>
              ) : null}
              <FormField id="rule-reason" label="Reason shown to customer" error={errors[`rules.${editing}.reason`]}>
                <TextArea value={rule.reason} maxLength={200} rows={2} onChange={(event) => update(editing, { reason: event.target.value })} />
              </FormField>
              <Checkbox id="rule-active" label="Active" hint="Switched-off rules aren't suggested." checked={rule.active} onChange={(event) => update(editing, { active: event.target.checked })} />
              <div className={styles.panelActions}>
                <Button type="submit" variant="secondary">
                  Done
                </Button>
                <Button type="button" variant="tertiary" onClick={() => move(editing, -1)} disabled={editing === 0}>
                  Move up
                </Button>
                <Button type="button" variant="tertiary" onClick={() => move(editing, 1)} disabled={editing === rules.length - 1}>
                  Move down
                </Button>
                <Button type="button" variant="destructive" onClick={() => removeRule(editing)}>
                  Delete rule
                </Button>
              </div>
            </form>
          ) : null}

          <section className={styles.panel} aria-labelledby="preview-title">
            <h2 id="preview-title" className={styles.panelTitle}>
              Preview
            </h2>
            <p className={styles.hint}>What a new project with these answers is offered, using the saved rules.</p>
            {numberQuestions.map((question) => (
              <FormField key={question.key} id={`preview-${question.key}`} label={question.label}>
                <TextField
                  inputMode="numeric"
                  value={previewAnswers[question.key] === undefined ? "" : String(previewAnswers[question.key])}
                  onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "");
                    setPreviewAnswers((current) => {
                      const { [question.key]: _old, ...rest } = current;
                      void _old;
                      return digits ? { ...rest, [question.key]: Number(digits) } : rest;
                    });
                  }}
                />
              </FormField>
            ))}
            <Button type="button" variant="secondary" onClick={runPreview}>
              Run preview
            </Button>
            {preview ? (
              preview.length ? (
                <ul className={styles.fields} aria-live="polite">
                  {preview.map((item) => (
                    <li key={item.key}>
                      <strong>{item.name}</strong> · {RECOMMENDATION_GROUP_LABEL[item.group]} · {item.suggestedQuantity === null ? "quantity after review" : `× ${item.suggestedQuantity.toLocaleString("en-NG")}`}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.hint} aria-live="polite">
                  Nothing would be suggested for these answers.
                </p>
              )
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}
