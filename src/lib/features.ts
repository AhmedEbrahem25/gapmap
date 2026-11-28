/** Internships and the partner-company portal show student data to outside companies, so they are off unless SHOW_PARTNERS=true. */
export const partnersEnabled = () => process.env.SHOW_PARTNERS === "true";
/** The adaptive learner model (knowledge tracing + activity bandit). On unless ADAPTIVE=false, which brings back the rule-only plan. */
export const adaptiveEnabled = () => process.env.ADAPTIVE !== "false";
