/** Internships and the partner-company portal show student data to outside companies, so they are off unless SHOW_PARTNERS=true. */
export const partnersEnabled = () => process.env.SHOW_PARTNERS === "true";
