import Dashboard from "./Dashboard";
import { industryAnchors, levels, stageMeta } from "./data";

export default function Home() {
  return <Dashboard levels={levels} industryAnchors={industryAnchors} stageMeta={stageMeta} />;
}
