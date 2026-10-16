# Tests

```sh
npm test        # compiles tests/ to .tmp/ and runs node --test
```

## What tests what

| File | Covers |
| --- | --- |
| `unit/validate.test.ts` | NIT, DUI, NRC, email and phone rules on canonical values |
| `unit/normalize.test.ts` | Round-trip between what we store and what we display |
| `unit/storage.test.ts` | CRUD, migrations, search, backups, and the two bugs from the previous version |
| `unit/types.test.ts` | CCF (tax credit) eligibility |
| `dom/scoping.test.ts` | **The most important one.** We never write into the Emisor tab |
| `dom/detect.test.ts` | Page detection and recipient root resolution |
| `dom/descriptors.test.ts` | Every declared field resolves to exactly one element |
| `dom/selects.test.ts` | Dropdowns are matched by code, never by text |
| `dom/docnumber.test.ts` | The deferred document number slot in CF |
| `dom/item.test.ts` | The item pop-up: every field resolves inside `<nuevo-item-doc>`, the option codes match, filling never leaks outside it, invalid stored products are refused, the typed quantity is kept |
| `dom/suggest.test.ts` | In-page suggestions: they appear only under Producto/Código, keys work, Esc doesn't close the portal's pop-up, late answers are dropped |
| `dom/ngselect.test.ts` | The `<ng-select>` driver against a synthetic double |
| `dom/popup.test.ts` | Popup smoke tests against the `dist/` bundle |
| `dom/import.test.ts` | Import page smoke tests against the `dist/` bundle |

## Snapshots are not versioned

The `dom/` tests need `cf.html` and `ccf.html`, captures of the portal form. They are not
versioned, so you must generate them: open `/cf` and `/ccf` and save each page with
"Save as… → Webpage, Complete". Put them in `fixtures/`, or point to wherever they are:

```sh
SNAPSHOTS_DIR=my-folder npm test
```

`cf-item.html` is the open "Ítem DTE" pop-up (identical in CF and CCF). Angular only
renders it while it is open, so capture it from DevTools with the pop-up open:

```js
copy(document.querySelector('nuevo-item-doc').closest('.modal-dialog').outerHTML)
```

**When they are missing, those tests skip themselves** instead of failing; in CI only the
unit tests and the popup/import smoke tests run.

## What these tests CANNOT prove

In jsdom **Angular is not running**. As a result:

- no `*ngIf` renders, so CF's document number field never appears;
- the department → municipality → district cascade never fires;
- no event reaches a `ControlValueAccessor`, ngx-mask, or ng-select.

So they validate **selectors and DOM traversal**, which is exactly where a portal change
(or a slip on our side with the Emisor/Receptor collisions) would silently break things.
Whether the value actually *reaches* the form must be checked by hand.

One more detail: when re-parsing `ccf.html`, the parser drops the `<form>` nested inside
`app-common-receptor` (a `<form>` inside another is invalid HTML). That's why nothing is
anchored to that form, neither in tests nor in code.

## Manual check against the real portal

Do it at least once per published version.

1. Load `dist/` unpacked; open `/ccf`; the badge shows `CCF`.
2. Fill the recipient by hand → **Guardar cliente actual** → the form opens with
   everything set, including the activity code and the municipality and district names.
3. Reload the page, pick that customer → **Rellenar** → all 11 fields are filled, **and
   the Emisor tab is untouched**. That last part is the most important item on this list.
4. `/cf` with a NIT customer: the type switches to `36`, the number field appears and
   gets the digits, the cascade completes, the activity shows the right label.
5. Repeat step 4 with DUI (`13`) and Passport (`03`).
6. A customer from a department other than the selected one, to force a real
   repopulation of the cascade.
7. A customer with no NRC or NIT on `/ccf`: it must warn "No apto para CCF" and fill the rest.
8. **Issue a real, complete document.** It's the only way for the backend to validate our
   values; the masks are the highest-risk point.
9. Export → clear the extension's data → import → fill again.
10. `/cf` → «Agregar Detalle → Producto o Servicio» → type 3 in Cantidad, then «caf» in
    Producto: the list appears under the field; `↓` `Enter` fills everything and keeps the 3.
    Press «Agregar ítem»: the line total is 3 × the stored price. `Esc` closes only the list,
    not the pop-up. Typing in Código suggests too.
11. Same on `/ccf` with a $5.00 taxed product: Precio is `4.42477876` and subtotal + IVA is
    $5.00. An exempt product keeps its price. A price ≥ $1,000 fills without a warning.
12. Pick a product with a code, then one without: Código ends up empty.
13. Set a product's `price` to `-1` in `chrome.storage.local` → picking it shows the reason
    under the field and fills nothing.

## CF's document number `formcontrolname`

Still unknown: the field isn't rendered in the snapshot. The code discovers it at runtime
and stores the name it finds in `chrome.storage.local`, under
`discovered.cfDocNumberControl`. After the first test on the real portal, check it in the
extension console and record it here:

```js
chrome.storage.local.get('discovered').then(console.log)
```

| Document type | Observed `formcontrolname` |
| --- | --- |
| `36` NIT | _pending_ |
| `13` DUI | _pending_ |
| `03` Passport | _pending_ |

To speed this up without waiting for the first test: open `/cf`, choose "NIT" in Tipo
Documento and run in the console

```js
copy(document.querySelector('app-facturador-cf tab[heading="Receptor"]').innerHTML)
```

saving the result as an extra snapshot.
