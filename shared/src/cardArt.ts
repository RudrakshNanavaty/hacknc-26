/**
 * The look of the generated card pictures. It is part of every picture's address (the server's cache
 * key and the URL the app asks for), so changing the style repaints every card and no browser or
 * server cache can keep serving the old one. Bump it whenever the prompt's look changes.
 */
export const CARD_ART_STYLE = 'v5';
