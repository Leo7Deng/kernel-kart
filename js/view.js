// The world rect the view being drawn shows (render.js sets it), for culling and parallax: x0..y1, cx, cy its middle,
// sc screen px per world unit, w, h its screen size. Drawing only.
export const VIEW = { x0: 0, y0: 0, x1: 0, y1: 0, cx: 0, cy: 0, sc: 1, w: 0, h: 0 };
// whether a point is on the view being drawn, give or take a margin m (world units); true while there's no view yet
export const inView = (x, y, m) => !(VIEW.x1 > VIEW.x0) || (x > VIEW.x0 - m && x < VIEW.x1 + m && y > VIEW.y0 - m && y < VIEW.y1 + m);
