/** The ids that tie a tab to its panel (`aria-controls`, `aria-labelledby`). */
export const tabId = (idBase: string, key: string) => `${idBase}-tab-${key}`;
export const tabPanelId = (idBase: string, key: string) => `${idBase}-panel-${key}`;
