import styles from "./catalogue.module.css";

/** The large "What do you need made?" search (PUB-FR-001, directory head, final band). */
export function BigSearch({ id, defaultValue, placeholder, label = "Search products", hidden = {} }: { id: string; defaultValue?: string; placeholder: string; label?: string; hidden?: Record<string, string> }) {
  return (
    <form className={styles.bigSearch} action="/products" role="search" aria-label={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <label htmlFor={id} className="hp-visually-hidden">
        {label}
      </label>
      <input id={id} name="q" type="search" defaultValue={defaultValue} placeholder={placeholder} autoComplete="off" enterKeyHint="search" />
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className={styles.searchButton}>
        Search
      </button>
    </form>
  );
}
