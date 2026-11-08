| Mode | Fault rate | Nights | Done reports | TP | FP (false done) | FN | TN | Precision | Recall | False-done rate | Gate said not done |
|---|---|---|---|---|---|---|---|---|---|---|---|
| blind | 0% | 20 | 1188 | 1186 | 2 | 2 | 246 | 99.8 % | 99.8 % | 0.2 % | 1 of 1061 |
| blind | 5% | 100 | 5687 | 5604 | 83 | 12 | 1481 | 98.5 % | 99.8 % | 1.5 % | 256 of 5316 |
| blind | 15% | 100 | 5162 | 4931 | 231 | 13 | 2005 | 95.5 % | 99.7 % | 4.5 % | 734 of 5286 |
| blind | 30% | 100 | 4382 | 3987 | 395 | 14 | 2784 | 91.0 % | 99.7 % | 9.0 % | 1578 of 5373 |
| sighted | 0% | 20 | 1188 | 1186 | 2 | 2 | 246 | 99.8 % | 99.8 % | 0.2 % | - |
| sighted | 5% | 100 | 5658 | 5592 | 66 | 30 | 1492 | 98.8 % | 99.5 % | 1.2 % | - |
| sighted | 15% | 100 | 5099 | 4917 | 182 | 48 | 2033 | 96.4 % | 99.0 % | 3.6 % | - |
| sighted | 30% | 100 | 4314 | 3971 | 343 | 68 | 2798 | 92.0 % | 98.3 % | 8.0 % | - |

Per fault type: requests hit (the last fault on a request counts), then caught (not reported done, not creditable), missed (false done), repaired (a later attempt succeeded, reported done), lost (creditable, not reported done).

| Fault | Mode | 5%: hit / caught / missed / repaired | 15%: hit / caught / missed / repaired | 30%: hit / caught / missed / repaired | Instead of done (all rates) |
|---|---|---|---|---|---|
| lost.lookalike | blind | 24 / 13 / 11 / 0 | 64 / 41 / 23 / 0 | 96 / 77 / 19 / 0 | failed 118, unreported 10, declined 2, cancelled 1 |
| lost.lookalike | sighted | 24 / 24 / 0 / 0 | 65 / 65 / 0 / 0 | 96 / 96 / 0 / 0 | failed 173, unreported 9, declined 2, cancelled 1 |
| lost.numbered | blind | 15 / 15 / 0 / 0 | 60 / 60 / 0 / 0 | 93 / 93 / 0 / 0 | failed 157, unreported 9, declined 1, cancelled 1 |
| lost.numbered | sighted | 14 / 14 / 0 / 0 | 61 / 61 / 0 / 0 | 93 / 93 / 0 / 0 | failed 157, unreported 9, declined 1, cancelled 1 |
| noise.no_answer | blind | 8 / 8 / 0 / 0 | 38 / 32 / 5 / 1 | 87 / 81 / 5 / 1 | failed 121 |
| noise.no_answer | sighted | 8 / 8 / 0 / 0 | 38 / 33 / 4 / 1 | 87 / 82 / 4 / 1 | failed 123 |
| noise.refuses | blind | 12 / 11 / 0 / 1 | 39 / 37 / 2 / 0 | 66 / 57 / 9 / 0 | failed 104, unreported 1 |
| noise.refuses | sighted | 12 / 11 / 0 / 1 | 39 / 38 / 1 / 0 | 66 / 59 / 7 / 0 | failed 107, unreported 1 |
| noise.restarts | blind | 9 / 0 / 9 / 0 | 40 / 2 / 38 / 0 | 67 / 6 / 61 / 0 | failed 8 |
| noise.restarts | sighted | 9 / 9 / 0 / 0 | 40 / 40 / 0 / 0 | 67 / 62 / 5 / 0 | failed 111 |
| place.outside | blind | 104 / 104 / 0 / 0 | 262 / 262 / 0 / 0 | 492 / 492 / 0 / 0 | failed 857, unreported 1 |
| place.outside | sighted | 104 / 104 / 0 / 0 | 263 / 263 / 0 / 0 | 493 / 493 / 0 / 0 | failed 859, unreported 1 |
| place.wrong_room | blind | 77 / 77 / 0 / 0 | 234 / 234 / 0 / 0 | 536 / 536 / 0 / 0 | failed 847 |
| place.wrong_room | sighted | 77 / 77 / 0 / 0 | 234 / 233 / 1 / 0 | 538 / 530 / 8 / 0 | failed 840 |
| room.occupied | blind | 33 / 0 / 33 / 0 | 94 / 0 / 94 / 0 | 195 / 0 / 195 / 0 | - |
| room.occupied | sighted | 33 / 0 / 33 / 0 | 94 / 0 / 94 / 0 | 195 / 0 / 195 / 0 | - |
| say.misheard | blind | 10 / 2 / 0 / 8 | 27 / 4 / 0 / 23 | 51 / 14 / 0 / 37 | failed 20 |
| say.misheard | sighted | 11 / 3 / 0 / 8 | 27 / 4 / 0 / 23 | 55 / 17 / 1 / 37 | failed 24 |
| say.no_answer | blind | 11 / 1 / 0 / 10 | 23 / 1 / 1 / 21 | 64 / 14 / 1 / 49 | failed 16 |
| say.no_answer | sighted | 11 / 1 / 0 / 10 | 23 / 2 / 0 / 21 | 67 / 17 / 0 / 50 | failed 20 |
| say.off_topic | blind | 8 / 1 / 0 / 7 | 27 / 2 / 0 / 25 | 64 / 14 / 2 / 48 | failed 17 |
| say.off_topic | sighted | 8 / 1 / 0 / 7 | 30 / 5 / 0 / 25 | 67 / 19 / 0 / 48 | failed 25 |
| say.polite_off_topic | blind | 13 / 0 / 13 / 0 | 39 / 0 / 39 / 0 | 67 / 0 / 67 / 0 | - |
| say.polite_off_topic | sighted | 12 / 0 / 0 / 12 | 36 / 7 / 0 / 29 | 58 / 15 / 1 / 42 | failed 22 |
| sign.next_to | blind | 19 / 19 / 0 / 0 | 65 / 65 / 0 / 0 | 116 / 115 / 0 / 0 (+1 lost) | failed 196, declined 4 |
| sign.next_to | sighted | 19 / 2 / 17 / 0 | 62 / 8 / 54 / 0 | 110 / 15 / 93 / 0 (+2 lost) | failed 23, declined 4 |
