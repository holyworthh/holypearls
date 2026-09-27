# Stage 4 Screen Map

## Scope

This map includes all 36 named frames from the Stage 4.1 Signal board and all 87 named anchors from the Stage 4.2 board: 123 mapped Pen frames. It includes 93 product-screen or screen-state anchors and 30 design-system, coverage or audit references. The 30 `img/*` entries on the Stage 4.1 board are image assets, not UI frames, so they are not screen rows. Stage 4.2 states that its archetypes cover 314 pages; it does not provide 314 unique screen designs.

The source is the open Pen file `untitled.pen`: Stage 4.1 Signal root `mRfIk` and Stage 4.2 root `B1jjw`. Stage 4.2 frame 02 locks the Signal direction. The older warm Stage 4.1 board is provisional/superseded and is not used as the active visual source.

## Screen and frame table

The PRD references below copy the mapped tracker rows' PRD refs. A dash means the tracker gives no PRD ref. The table does not infer browser paths from API endpoints. The only browser path found is `/start` in the T05-01 tracker Build field; PRD/TECH do not define a web route table.

| Screen name | Pen.dev frame/node ID or link | Breakpoint | Route (from PRD/TECH) | State shown | PRD requirement IDs | Ticket(s) that build it |
| --- | --- | --- | --- | --- | --- | --- |
| 01 Research reference board | Nunpu | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05, T14-06 |
| 02 Art direction synthesis | T5qRtk | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05 |
| 03 Colour system | s87lb | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05 |
| 04 Typography system | dBj26 | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05 |
| 05 Grid + spacing | aZdqe | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05 |
| 06 Shape, border + elevation | kxHuw | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05 |
| 07 Icon direction | Qp9No | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05 |
| 08 Photography direction | ZhVJO | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05 |
| 09 Motion system | lPiWj | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05 |
| 10 Navigation | R7yPPS | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05, T02-04 |
| 11 Actions + forms | sDx8H | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05, T01-05 |
| 12 Commerce | DuEFo | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05, T03-04 |
| 13 Status, transaction + project | nwaUu | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05, T05-05, T06-02, T07-03 |
| 14 B2B + project primitives | O6rPH9 | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05, T10-03, T12-02, T12-04 |
| 15 Homepage — desktop | FYNoI | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-001–005, PUB-FR-014 | T02-04 |
| 16 Homepage — mobile | kZf2b | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-001–005, PUB-FR-014 | T02-04 |
| 17 Product Directory — desktop | bhA8B | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-008, PUB-FR-010 | T02-03 |
| 18 Category hub — Apparel | jUd9y | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-009 | T02-05 |
| 19 Polo PDP — desktop | V3j7CP | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-020–026 | T03-04, T03-05 |
| 20 Polo PDP — mobile | XX8rq | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-020–026 | T03-04, T03-05 |
| 21 Business Cards PDP | VSjt2 | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044 | T03-04 |
| 22 Polo Configurator — visual step | O2tORo | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-010–014; COM-FR-020–026; COM-FR-027–029; COM-FR-050–054 | T03-03, T03-05, T03-06, T03-07 |
| 23 Start a Project — landing | jRe2D | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH; tracker Build says /start | Representative view; specific state not named | PROJ-FR-001–002, 007 | T05-01 |
| 24 Event Builder — recommendations | LqHMw | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Recommendations shown | PROJ-FR-003–006 | T05-02 |
| 25 Quote — desktop | nPbFB | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | QUOTE-FR-002–006; QUOTE-FR-007–008; PAY-FR-001–004 | T05-05, T05-06, T05-07 |
| 26 Proof — desktop | u6wexU | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | FUL-FR-002–004, 006 | T06-02 |
| 27 Order Tracking — mobile | a5YAJ | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | FUL-FR-010–011, 033, 040 | T07-03 |
| 28 Workspace Overview — desktop | e851AK | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-004, 010–011 | T10-03 |
| 29 Template Detail — desktop | B7pn1V | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-024, 030–033; OPS-FR-082 | T11-02 |
| 30 Group Organizer — desktop | qig8v | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-053–055; OPS-FR-090 | T12-04 |
| 31 Participant flow — mobile | POSSY | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-060–064 | T12-02 |
| 32 Company Store — mobile | qfJ9a | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-080–083 | T12-06 |
| 33 Responsive notes | b9wXLJ | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T14-06 |
| 34 Accessibility notes | Ve68T | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T14-03, T14-04 |
| 35 Asset gap register | r89fHf | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T14-06 |
| 36 Design system changelog | s8AUm | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05, T14-06 |
| 01 Stage 4.2 cover + scope lock | kCzSq | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05, T14-06 |
| 02 Stage 4.1 visual lock | lyo0w | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05 |
| 03 Archetype map | ObD5h | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T14-06 |
| 04 Component delta register | i8Fkk | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05 |
| 05 Reference implementation notes | lUw5c | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05 |
| 06 Product Directory — mobile | r2L62s | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-008, PUB-FR-010 | T02-03 |
| 07 Search — desktop | S82uZc | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-006, 007, 016 | T02-07 |
| 08 Search — mobile | qxLIy | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-006, 007, 016 | T02-07 |
| 09 Search autocomplete | R8Aqc | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Search suggestions open | PUB-FR-006, 007, 016 | T02-07 |
| 10 Search — no results | ZW64K | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Empty search results | PUB-FR-006, 007, 016 | T02-07 |
| 11 Print & Display category hub | YBK8S | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-009 | T02-05 |
| 12 Projects directory | xiB3h | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-011–013, PUB-FR-015 | T02-06 |
| 12B Project detail | SZbrl | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-011–013, PUB-FR-015 | T02-06 |
| 13 Corporate Shirt PDP | ebGKR | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 14 Chef Jacket PDP | aD8iO | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 15 Workwear PDP — Coveralls | k4xbJ2 | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 16 Native Garment PDP — Agbada | vEhJb | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 17 Logo Embroidery PDP | YTX4M | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 18 Native-Wear Embroidery PDP — Agbada | pi4mA | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 19 3D / Puff Embroidery PDP | gCXiS | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 20 Heat Transfer Printing PDP | W4D2qc | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 21 Custom Apparel Printing PDP | nXa3D | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 22 Flyers PDP | aCTvH | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 23 Brochure PDP | JqNMT | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 24 Menu PDP | WlfxQ | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 25 Roll-Up Banner PDP | a3Cz5Q | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 26 Backdrop PDP | J4nt3C | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 27 Flex Banner PDP | V0iCR | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 28 Paper Bag PDP | xCi39 | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 29 Presentation Packaging PDP | K6bLZ | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 30 Custom Packaging PDP | YccpK | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 31 Standard Mug PDP | zEVhX | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 32 Water Bottle PDP | toC45 | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 33 Tote Bag PDP | HZJnm | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 34 Product Label PDP | s4Lfg | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 35 Custom Shape Sticker PDP | SyqHL | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 36 Canvas PDP | p3CJCn | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 37 Framed Print PDP | wlWJc | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 38 PDP family state board | N0G3q | Multiple / state reference | Not specified in PRD/TECH | Multiple PDP family states | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08 |
| 39 Representative PDP mobile comparison | tiuH7 | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-001–005, 040–044; COM-FR-045–047 | T03-04, T03-08, T14-06 |
| 40 Configurator — mobile | PeLav | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-010–014; COM-FR-020–026; COM-FR-027–029; COM-FR-050–054; COM-FR-060–061, 070–072 | T03-03, T03-05, T03-06, T03-07, T03-09 |
| 41 Cart — desktop | mxbbU | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-080–081 | T04-01 |
| 42 Cart — mobile | TMY8X | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-080–081 | T04-01 |
| 43 Checkout — desktop | S6NsSE | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-083–084; OPS-FR-100–101; PAY-FR-001–005, 008–011 | T04-02, T04-03 |
| 44 Checkout — mobile | gig9b | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | COM-FR-083–084; OPS-FR-100–101; PAY-FR-001–005, 008–011 | T04-02, T04-03 |
| 45 Checkout states | JqRLl | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Multiple checkout states | COM-FR-083–084; OPS-FR-100–101; PAY-FR-001–005, 008–011; PAY-FR-007, 009, 010, 012 | T04-02, T04-03, T04-04 |
| 46 Quote — mobile | r8lGW | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | QUOTE-FR-002–006; QUOTE-FR-007–008; PAY-FR-001–004 | T05-05, T05-06, T05-07 |
| 47 Quote — expired | i3MiU | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Quote expired; read-only | QUOTE-FR-002–006 | T05-05 |
| 48 Quote — reapproval required | Oe5Uk | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Organization re-approval required | QUOTE-FR-002–006; QUOTE-FR-007–008; QUOTE-FR-020–022; B2B-FR-043–044 | T05-05, T05-06, T11-05 |
| 49 Proof — mobile | Hnlcm | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | FUL-FR-002–004, 006 | T06-02 |
| 50 Proof — version history and approved | n86Z1a | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Proof version history; approved | FUL-FR-002–004, 006 | T06-02 |
| 51 Order — desktop complex | aV63z | Desktop | Not specified in PRD/TECH | Complex order example | FUL-FR-010–011, 033, 040; FUL-FR-030–031, 060; PAY-FR-001–004 | T07-03, T08-02, T05-07 |
| 52 Order — simple direct order | fuUCR | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Direct-order example | FUL-FR-010–011, 033, 040; FUL-FR-030–031, 060; COM-FR-082, 085; PAY-FR-006 | T07-03, T08-02, T04-05 |
| 53 Guest track order / magic link | m0t8za | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Guest tracking through magic link | FUL-FR-010–011, 033, 040 | T07-03 |
| 54 Our Work index | j9dFP | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-011–013, PUB-FR-015 | T02-06 |
| 55 Case study detail | nnXfJ | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-011–013, PUB-FR-015 | T02-06 |
| 56 Resources index | IkI3Y | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-011–013, PUB-FR-015 | T02-06 |
| 57 Resource article — desktop | nbOI4 | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-011–013, PUB-FR-015 | T02-06 |
| 58 Resource article — mobile | C43mU9 | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-011–013, PUB-FR-015 | T02-06 |
| 59 About | LXw1v | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-011–013, PUB-FR-015 | T02-06 |
| 60 Contact | Czozq | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | PUB-FR-011–013, PUB-FR-015; PRD 00 §18; PUB-FR-015; PROJ-FR-008 | T02-06, T01-07 |
| 61 404 / unknown demand | uYLb4 | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | 404 / unknown demand | PRD 00 §12 | T00-05 |
| 62 Workspace Overview — mobile | Rtyrl | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-004, 010–011 | T10-03 |
| 63 Orders index | Jn2wL | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-004, 010–011; FUL-FR-010–011, 033, 040 | T10-03, T07-03 |
| 64 Projects index | cNcKd | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-004, 010–011 | T10-03 |
| 65 Brand Assets index | bZMif | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-020–023; OPS-FR-083 | T11-01 |
| 66 Asset Detail | sgg2F | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-020–023; OPS-FR-083 | T11-01 |
| 67 Asset replacement → blocked template | FTR8w | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Replacement blocked by linked template | B2B-FR-020–023; OPS-FR-083; B2B-FR-024, 030–033; OPS-FR-082 | T11-01, T11-02 |
| 68 Templates index | w6wi5 | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-024, 030–033; OPS-FR-082 | T11-02 |
| 69 Template Detail — mobile | kFYAK | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-024, 030–033; OPS-FR-082; B2B-FR-033; Journey 8 | T11-02, T11-03 |
| 70 Team | HLbMo | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-090–093 | T10-02 |
| 71 Locations | fEByF | Desktop (INFERRED; breakpoint not named) | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-001–003; OPS-FR-080–081 | T10-01 |
| 72 Approval Review — desktop | hirBW | Desktop | Not specified in PRD/TECH | Approval review | B2B-FR-040–042 | T11-04 |
| 73 Approval Review — mobile + reapproval | mZWyB | Mobile | Not specified in PRD/TECH | Organization re-approval required | B2B-FR-040–042; QUOTE-FR-020–022; B2B-FR-043–044 | T11-04, T11-05 |
| 74 Group Organizer — mobile | hnmBe | Mobile | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-050–052; B2B-FR-053–055; OPS-FR-090 | T12-01, T12-04 |
| 75 Group CSV validation | mEw4a | Multiple / state reference | Not specified in PRD/TECH | CSV validation feedback | B2B-FR-070–073 | T12-03 |
| 76 Participant variants | AhA0c | Multiple / state reference | Not specified in PRD/TECH | Multiple participant variants | B2B-FR-060–064 | T12-02 |
| 77 Company Store — desktop procurement | sSl53 | Desktop | Not specified in PRD/TECH | Representative view; specific state not named | B2B-FR-080–083 | T12-06 |
| 78 Company Store — mobile states | m8W6b | Mobile | Not specified in PRD/TECH | Multiple company-store states | B2B-FR-080–083 | T12-06 |
| 79 Utility state board | NkQq9 | Multiple / state reference | Not specified in PRD/TECH | Multiple utility states | PRD 00 §12 | T00-05, T14-03, T14-04, T14-06 |
| 80 New/extended component library | fjC31 | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05 |
| 81 Responsive coverage summary | m9kfBD | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T14-06 |
| 82 Asset gap update | hO3Hd | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T14-06 |
| 83 314-page coverage summary | B9kr2o | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T14-06 |
| 84 Visual repetition audit | I604QS | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T14-06 |
| 85 Accessibility, performance and indexing notes | z93oA | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T14-01, T14-03, T14-04, T14-05, T14-06 |
| 86 Stage 4.2 changelog and deviations | yg4z4 | N/A — design/reference frame | N/A — not a product screen | Design-system, coverage or audit reference; not a product screen | N/A — reference frame | T00-05, T14-06 |

## Ticket gaps

**GAP** means the tracker Build scope names a screen or UI surface, but no matching Stage 4 frame shows that surface. A related parent screen does not close a gap for a missing admin or interaction flow. Component-only and cross-cutting test tickets do not need a stand-alone page frame.

| GAP ticket | Missing UI surface from the tracker Build scope | Evidence |
| --- | --- | --- |
| **GAP — T00-06** | Sign-in, magic-link/password, signed-in page, and revoke-session user screens | No matching identity frame is present. |
| **GAP — T00-07** | Staff account, MFA enrollment/challenge, and protected admin shell | The library has navigation primitives; no staff identity/admin screen is shown. |
| **GAP — T01-01** | Admin audit viewer and filters | No audit screen is present. |
| **GAP — T01-02** | Admin notification log and resend controls | No notification screen is present. |
| **GAP — T01-07** | Admin help inbox (OPEN/ANSWERED/CLOSED) | Contact is mapped; the staff inbox is not shown. |
| **GAP — T02-02** | Admin product and category list/edit/publish screens | Public catalogue frames do not show the admin editor. |
| **GAP — T02-05** | Category hub admin editing controls | The public category hub is mapped; its editing surface is absent. |
| **GAP — T02-06** | Admin content editor | Public content pages are mapped; the editor is absent. |
| **GAP — T03-01** | Admin product, price, tax and rule editors | No rules-admin screen is present. |
| **GAP — T04-02** | Admin Nigeria delivery zones and rates | Checkout is mapped; the rate administration surface is absent. |
| **GAP — T04-06** | Payments list, intent detail, review queue and settings | No payments-admin screen is present. |
| **GAP — T05-02** | Admin recommendation-rule editor | The customer recommendation view is mapped; rule management is absent. |
| **GAP — T05-03** | Customer project review/submission/confirmation and staff project queue | The builder and recommendation steps are mapped; review and queue screens are absent. |
| **GAP — T05-04** | Staff quote builder and version editor | Customer quote frames do not show the staff editor. |
| **GAP — T06-01** | Staff proof preparation and artwork review queue | Customer proof frames are mapped; preparation is absent. |
| **GAP — T06-03** | Proof comment and pin interaction states | The viewer is mapped; comment/pin states are not explicit in a frame. |
| **GAP — T06-04** | After-approval change request and staff decision screens | No matching change-review frame is present. |
| **GAP — T07-01** | Admin production board and item update controls | Customer order status frames do not show the staff board. |
| **GAP — T07-02** | Admin hold/release actions and recovery states | Customer order states do not show staff hold/release controls. |
| **GAP — T07-04** | Customer cancellation/scope-change forms and staff review | No matching request flow is present. |
| **GAP — T08-01** | Admin shipment creation and status management | Customer tracking is mapped; shipment administration is absent. |
| **GAP — T08-03** | Reorder eligibility, changed-order draft and completion flow | Order frames do not identify these reorder states. |
| **GAP — T08-04** | Customer problem report and admin triage queue | No matching report/triage frame is present. |
| **GAP — T09-01** | Customer sign-up, sign-in, profile and security pages | No customer account identity screens are present. |
| **GAP — T09-02** | Account history dashboard and guest-record linking | Workspace screens are organization views; no personal account history screen is shown. |
| **GAP — T10-04** | Workspace billing and workspace search | Workspace overview and lists are mapped; billing/search are not shown. |
| **GAP — T11-01** | Staff production review, retire and archive controls for brand assets | Workspace asset screens are mapped; staff review controls are absent. |
| **GAP — T11-02** | Staff template creation and approval screens | Workspace template screens are mapped; the staff authoring/approval surface is absent. |
| **GAP — T11-03** | Order-from-template checkout and quote transition | Template detail is mapped; the order flow is not explicit. |
| **GAP — T12-01** | Group collection creation and setup controls | Organizer is mapped; the setup/configuration flow is not explicit. |
| **GAP — T12-04** | Close/reopen and Order Draft review states | Organizer dashboard is mapped; these outcomes are not explicit in the frame title. |
| **GAP — T12-05** | Paid participant removal and payment-resolution review | No matching state frame is present. |
| **GAP — T12-07** | Allowance policy editor, ledger and over-limit approval | No allowance screen is present. |
| **GAP — T13-01** | Business-rule administration | No matching admin screen is present. |
| **GAP — T13-02** | Installation area/capability and freight-rule administration | No matching admin screen is present. |
| **GAP — T13-03** | Operations home and permission-filtered queues | No operations-home frame is present. |
| **GAP — T13-04** | Export request/status and personal-data MFA flow | No export screen is present. |
| **GAP — T13-06** | Staff list, invite, permission grant/revoke, deactivate and MFA reset | No staff-user administration screen is present. |
| **GAP — T13-05** | Staff refund review and resolution states | No refund screen is present; the tracker Build includes refund and review work. |
| **GAP — T15-04** | Privacy notice, consent, processor list, and staff data export/erase tools | No privacy or data-subject-request screen is present. |
| **GAP — T15-05** | Monitoring/incident dashboard and incident switches | No staff operations control screen is present. |

## Mapping notes

- No product-screen row is left without a ticket mapping. The GAPs above are tracker surfaces without matching design frames.
- Breakpoints explicitly stated in a frame title are recorded as mobile or desktop. “Desktop (INFERRED)” means the title does not name a breakpoint; it is not a measured CSS breakpoint.
- Where a frame title names a state, the table records that state. For other screens, it says the state is not named instead of guessing.
- `Not specified in PRD/TECH` means no browser route was found in those source docs. API routes in TECH-02 are not browser routes.
- No screenshots were exported. Pen MCP exposed the design nodes for inspection.
