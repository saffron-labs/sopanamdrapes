# Sopanam Drapes

First prototype of a premium rebuild of the Sopanam Drapes saree and ornaments store.

Open `index.html` in a browser. There is no build step; fonts load from Google Fonts.

## What the prototype shows

- Five occasion worlds: The Bridal House, Festive Kerala, Celebrations, Occasions & parties, Everyday & office. Each filters the collection.
- The 8 sarees and 21 ornaments from the current catalogue, with real prices, discounts and stock.
- A Complete the Look builder: 7 ornament slots, 3 choices each, live total, 10% off ornaments when 2 or more pieces are chosen.
- Add to bag (not connected to checkout yet), light and dark themes, phone layout.
- **Sakhi, the AI stylist** (`stylist.html`, plus an "Ask Sakhi" button on every page): asks occasion, skin tone, undertone, height, build, jewellery taste and budget, then styles three complete looks from the real catalogue with reasons, drape, blouse and finishing tips. Reads skin tone from a selfie on the device, matches an inspiration photo to the closest saree, answers questions about fabrics, care, delivery and returns, swaps ornaments, saves looks, shares to WhatsApp and adds looks to the bag.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | The whole prototype: markup, styles and script in one file |
| `img/` | Model photographs and weave close-ups, one per saree |
| `docs/content-inventory.md` | Every page, product, policy and gap found on the current site |
| `stylist.html`, `assets/stylist*.{js,css}` | Sakhi: on-device styling engine, chat UI, page launcher |
| `api/chat.js` | Vercel function: Sakhi's open conversation via Vercel AI Gateway. Falls back to the on-device engine if unavailable |
| `docs/catalog.json` | Raw catalogue data (sarees, ornaments, default looks, pricing) |

## Notes

- The photographs in `img/` are AI-generated concept images. Replace them with real product photography before launch.
- Assumptions to confirm with the client: the 10% look discount applies from 2 pieces; the mapping of sarees to occasion worlds; one ornament per slot (the current site allows several).
- The bag and checkout are placeholders. Payments, shipping, accounts and admin are planned for later phases.
