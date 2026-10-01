import styles from "./admin.module.css";
import { requireAdmin } from "./admin-session";

const greeting = (now = new Date()) => {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Lagos" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
};

export default async function AdminHome() {
  const admin = await requireAdmin();
  const firstName = admin.displayName.split(" ")[0];
  return (
    <>
      <h1 className={styles.title}>
        {greeting()}, {firstName}
      </h1>
      <p className={styles.support}>
        Operations home arrives in T13-03. Sidebar sections only appear when your staff permissions allow them.
      </p>
    </>
  );
}
