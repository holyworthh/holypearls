import styles from "./footer.module.css";

/**
 * Newsletter slot (Pen HP/Nav/Footer). There's no mailing list yet, so it
 * keeps the Pen bar's place but asks for nothing: no field, no Subscribe
 * button, no address taken and dropped. The form returns with the list.
 */
export function Newsletter() {
  return <p className={styles.newsletter}>Email updates are coming soon.</p>;
}
