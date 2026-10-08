# Pomi routine generator: evidence base (research date 2026-10-07)

Verification method: DOIs resolved through the Crossref API; abstracts read through PubMed E-utilities / Europe PMC. "Verified" = DOI resolved AND abstract read. "Verified (secondary)" = DOI resolved, content taken from a secondary summary. "Unverified" = could not be opened or confirmed.
Rules marked [DESIGN] are engineering choices that interpolate between sources; they are not direct findings and must be labelled as defaults in code.

---

## 0. Headline: ACSM 2026 position stand now exists (supersedes 2009)

- Currier B, ... Schoenfeld B, ... Phillips SM (chair). ACSM Position Stand: Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. Med Sci Sports Exerc 2026 (online 2026-03-05). DOI 10.1249/MSS.0000000000003897 (PMC12965823). Overview of 137 systematic reviews, >30,000 participants. VERIFIED (abstract read via Europe PMC).
- Findings (abstract): strength enhanced by loads >=80% 1RM, complete ROM, 2-3 sets, exercises early in the session, >=2 sessions/wk. Hypertrophy enhanced by higher volumes (>=10 sets/wk) and eccentric overload. Power: 30-70% 1RM, <=24 reps per set... Training to momentary failure, equipment type, exercise complexity, set structure, time under tension, BFR and periodization "did not consistently impact training outcomes".
- Secondary summaries (NFPT, 2minutemedicine, Newswise) add: all major muscle groups >=2 days/wk, 1-2 RIR gives similar results when volume is controlled. Full-text recommendation tables were NOT read; do not cite those extra numbers as ACSM-primary.
- Older: Ratamess et al., ACSM Position Stand 2009, Med Sci Sports Exerc 41(3):687-708, DOI 10.1249/MSS.0b013e3181915670. VERIFIED. Novice 8-12 RM; 2-10% load increase when 1-2 reps over target; frequency 2-3 d/wk novice; 3-4 intermediate; 4-5 advanced; hypertrophy 6-12 RM emphasis, 1-2 min rest; multi-joint before single-joint, large before small muscle. Superseded but still the only source for load-increment %, novice frequency, and exercise order.

---

## 1. Weekly volume per muscle

**Rule for the generator**
- NOTE: the per-goal bands below are the first draft; the section 12 table is AUTHORITATIVE where they differ (e.g. fat loss beginner 4-6 / intermediate 6-10, health 4-8, strength by level), and the generator follows it.
- Count "hard sets" per muscle per week. Direct set = 1.0; indirect (secondary mover) set = 0.5 (Pelland's "fractional" method).
- Hypertrophy target (direct-equivalent sets/muscle/week): beginner 8-10, intermediate 10-14, advanced 12-18 (cap 20). Prioritized muscle (e.g., glutes for a glute goal): +2-4 sets above that band. [DESIGN: bands interpolate the dose-response; ACSM floor is >=10]
- General strength: 6-10 sets per main lift pattern per week (diminishing returns for strength are more pronounced than for hypertrophy).
- Fat loss / general health: 4-8 sets per muscle per week is enough (ACSM: any RT beats none; WHO: 2 d/wk). [DESIGN]
- Never program <4 or >20 sets/muscle/week.
- Session cap: <=10-12 hard sets per muscle per session (split across sessions when weekly volume exceeds that). [DESIGN]
- Beginners: start at the low end and add 1-2 sets/muscle/week every 3-4 weeks only if progress stalls. [DESIGN]

**Evidence**
1. Pelland JC et al. The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains. Sports Med 2025. DOI 10.1007/s40279-025-02344-w. Multilevel Bayesian meta-regression, 67 studies, 2058 participants. Volume increases hypertrophy and strength with diminishing returns (stronger for strength); fractional counting of indirect sets fits best. VERIFIED (abstract). Exact predicted-gain-per-set numbers are NOT in the abstract; I could not open the full text (Springer paywall), so those numbers are UNVERIFIED.
2. Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly RT volume and increases in muscle mass. J Sports Sci 2017;35(11):1073-82. DOI 10.1080/02640414.2016.1210197. Meta-regression, 15 studies. Each extra weekly set = +0.37% gain; 10+ sets/wk gave about 3.9% more growth than fewer. VERIFIED.
3. Schoenfeld BJ et al. Resistance training volume enhances muscle hypertrophy but not strength in trained men. Med Sci Sports Exerc 2019. DOI 10.1249/MSS.0000000000001764. RCT, 34 trained men; 1 vs 3 vs 5 sets/exercise; hypertrophy favored higher volume, strength did not differ. VERIFIED.
4. Krieger JW. Single vs multiple sets for hypertrophy. J Strength Cond Res 2010. DOI 10.1519/JSC.0b013e3181d4d436. Meta-analysis; multiple sets > one set (ES diff 0.10); no difference 2-3 vs 4-6 sets per exercise. VERIFIED (older than 10 years; supporting only).
5. Ralston GW et al. Effect of weekly set volume on strength gain. Sports Med 2017. DOI 10.1007/s40279-017-0762-7. Meta-analysis, 9 studies; strength gains plateau at moderate weekly volume. VERIFIED (abstract truncated before the numeric result; read result lines not confirmed).
6. Androulakis-Korakakis P et al. Minimum effective training dose to increase 1RM in trained men. Sports Med 2020. DOI 10.1007/s40279-019-01236-0. Systematic review; low volume sustains strength. VERIFIED (abstract partially read).
7. ACSM 2026 (section 0): >=10 sets/wk for hypertrophy; 2-3 sets per exercise for strength.

**Confidence**: High that more volume gives more hypertrophy with diminishing returns; moderate for the specific numeric bands; low for per-level splits (most trials use untrained or young men, 79% male in Pelland).

---

## 2. Frequency per muscle per week

**Rule**
- Default 2 sessions per muscle per week for all goals and levels (all major muscles >= 2 d/wk, matching ACSM 2026 and WHO 2020).
- 3x per week per muscle only when weekly sets for that muscle exceed ~12-16, or when the user trains 5+ days and wants strength emphasis. 1x only as a fallback when days/week = 2 and the program is full-body (then every muscle is hit 2x/week anyway).
- Frequency is a scheduling variable for hypertrophy (distribute the volume); it is a modest positive variable for strength.

**Evidence**
1. Schoenfeld BJ, Grgic J, Krieger JW. How many times per week should a muscle be trained to maximize muscle hypertrophy? J Sports Sci 2019;37(11):1286-95. DOI 10.1080/02640414.2018.1555906. SR + meta-analysis, 25 studies; no difference on a volume-equated basis. VERIFIED.
2. Grgic J et al. Effect of RT frequency on gains in muscular strength. Sports Med 2018. DOI 10.1007/s40279-018-0872-x. Meta-analysis, 22 studies; ES 0.74/0.82/0.93/1.08 for 1/2/3/4+ d/wk, but not significant when volume-equated. VERIFIED.
3. Pelland 2025 (above): frequency effect on hypertrophy compatible with negligible; on strength positive with diminishing returns. VERIFIED.
4. Currier BK et al. Resistance training prescription for muscle strength and hypertrophy in healthy adults: SR and Bayesian network meta-analysis. Br J Sports Med 2023;57:1211-20. DOI 10.1136/bjsports-2023-106807. 178 strength studies / 119 hypertrophy studies. Best-ranked hypertrophy prescription: higher-load, multiset, twice weekly; best for strength: higher-load, multiset, thrice weekly. All prescriptions beat control. VERIFIED.
5. Ralston GW et al. Weekly training frequency effects on strength gain. Sports Med Open 2018. DOI 10.1186/s40798-018-0149-9. VERIFIED (abstract partially read).

**Confidence**: High (hypertrophy, volume-equated); moderate (strength).

---

## 3. Load, rep range, proximity to failure

**Rule**
- Hypertrophy: any load from ~30% to ~85% 1RM works if sets are taken close to failure; default 6-12 reps for compound lifts, 10-20 reps for isolation/machine, 12-20 for bodyweight/dumbbell home work when load is limited.
- Strength: main lifts at 3-8 reps (about 75-90% 1RM); keep >=80% 1RM only for experienced users (ACSM 2026: >=80% 1RM optimizes strength).
- Effort: working sets end at 1-3 RIR (beginner: 2-3 RIR; intermediate 1-3; advanced 0-2 on isolation/machine, 1-3 on compounds). Last set of an exercise may go to 0-1 RIR on machine/isolation lifts only. [DESIGN]
- Do not prescribe failure on barbell compounds for beginners.
- Beginners: RIR self-rating is inaccurate; show a plain-language cue ("you could do about 2-3 more reps") and default to the cap 2-3 RIR.
- Fat loss / general health: 8-15 reps, 2-3 RIR.
- Home bodyweight: progress by reps first (up to ~20-30 per set at 2 RIR), then harder variation (tempo, single-leg, deficit).

**Evidence**
1. Schoenfeld BJ et al. Strength and hypertrophy adaptations between low- vs high-load RT: SR and meta-analysis. J Strength Cond Res 2017;31(12):3508-23. DOI 10.1519/JSC.0000000000002200. 21 studies; hypertrophy similar; strength favors heavy load (1RM). VERIFIED.
2. Lopez P et al. Resistance training load effects on muscle hypertrophy and strength gain: SR and network meta-analysis. Med Sci Sports Exerc 2021. DOI 10.1249/MSS.0000000000002585. 28 studies; no hypertrophy difference between low/moderate/high loads when taken to failure; strength better with high/moderate loads. VERIFIED.
3. Schoenfeld BJ et al. Loading recommendations for muscle strength, hypertrophy, and local endurance: a re-examination of the repetition continuum. Sports 2021;9(2):32. DOI 10.3390/sports9020032. Narrative review. VERIFIED.
4. Refalo MC et al. Influence of RT proximity-to-failure on hypertrophy. Sports Med 2023. DOI 10.1007/s40279-022-01784-y. 15 studies; no evidence failure is superior to non-failure (ES 0.12, CI -0.13 to 0.37). VERIFIED.
5. Robinson ZP et al. Dose-response of estimated RIR to strength and hypertrophy. Sports Med 2024. DOI 10.1007/s40279-024-02069-2. Strength: negligible relation with RIR; hypertrophy: gains increase as sets end closer to failure (modest model fit, estimated RIR). VERIFIED.
6. Grgic J et al. RT to repetition failure vs non-failure. J Sport Health Sci 2022. DOI 10.1016/j.jshs.2021.01.007. 15 studies; no difference for strength or hypertrophy. VERIFIED.
7. Hackett DA et al. Accuracy in estimating repetitions to failure. J Strength Cond Res 2017. DOI 10.1519/JSC.0000000000001683. Error ~1 rep within 0-5 RIR but >2 reps at 7-10 reps from failure; leg press less accurate than chest press. VERIFIED. Supports capping prescribed RIR at 0-3 and avoiding far-from-failure RIR targets.
8. Zourdos MC et al. RIR-based RPE scale. J Strength Cond Res 2016. DOI 10.1519/JSC.0000000000001049. Experienced squatters rate more accurately than novices. VERIFIED.
9. ACSM 2026: "training to momentary muscle fatigue ... did not consistently impact training outcomes"; secondary summaries state 1-2 RIR yields similar adaptations at equated volume.

**Confidence**: High (load flexibility for hypertrophy; heavier loads for strength); moderate (RIR targets; effect near failure is small and RIR is estimated).

---

## 4. Rest intervals

**Rule**
- Compounds: 2-3 min (strength emphasis 3-4 min). Isolation/machine: 60-90 s. Bodyweight/home circuits: 45-90 s.
- Hypertrophy sessions limited in time: >=60-90 s is enough; shorten rest only to fit the time budget and compensate by trimming sets, not by cutting rest below 60 s.
- Cardio/health goals: 30-60 s between accessory sets acceptable.
- restSec default: compound 150, secondary compound 120, isolation 75.

**Evidence**
1. Singer A et al. Give it a rest: SR with Bayesian meta-analysis of inter-set rest and hypertrophy. Front Sports Act Living 2024. DOI 10.3389/fspor.2024.1429789. 9 studies; small benefit of >60 s; no appreciable difference resting >90 s. VERIFIED.
2. Grgic J et al. Effects of rest interval duration on strength: SR. Sports Med 2017;47:2531-.... DOI 10.1007/s40279-017-0788-x. 23 studies; robust gains even with <60 s, but >2 min needed to maximize strength in trained lifters; short-moderate rest is adequate in untrained. VERIFIED.
3. Schoenfeld BJ et al. Longer interset rest periods enhance strength and hypertrophy in trained men. J Strength Cond Res 2016. DOI 10.1519/JSC.0000000000001272. RCT n=21; 3 min > 1 min for squat/bench 1RM and anterior thigh thickness. VERIFIED.
4. ACSM 2009 (Ratamess): 1-2 min for hypertrophy, 3-5 min for heavy strength. VERIFIED (older).

**Confidence**: High for "rest >60-90 s is not worse"; moderate for the 2-3 min default.

---

## 5. Progression, load increments, deloads, periodization

**Rule**
- Double progression (engine rule): each exercise has a rep range (e.g., 8-12). When all sets reach the top of the range at the target RIR, increase load next session; reset reps to the bottom of the range. [DESIGN: no RCT compares double progression to alternatives; it operationalizes ACSM's "2-10% when 1-2 reps over the target"]
- incrementKg defaults: upper-body barbell 2.5 kg (about 2-5%), lower-body barbell 5 kg, dumbbells 1-2 kg per hand (smallest available step), machines 2.5-5 kg (one plate). Cap increases at ~10%; if user misses the bottom of the range twice, hold the load or drop 5-10%. [DESIGN, anchored to ACSM 2-10%]
- Home dumbbells: with coarse steps, progress through reps, then tempo/unilateral variation, then load.
- Periodization: do NOT add complex periodization; use simple constant-structure blocks. Beginners: linear progression. Offer an optional 4-6 week "re-set" week.
- Deload: reactive trigger (performance down on 2 consecutive sessions for the same lift, or user-reported high fatigue/pain) -> one week at ~50-60% of sets and -10% load, same frequency. Not scheduled for beginners. Optional planned deload every ~6-8 weeks for advanced users. [DESIGN]

**Evidence**
1. Ratamess 2009 ACSM: 2-10% load increase when 1-2 reps over target; novice 8-12 RM. VERIFIED.
2. ACSM 2026: periodization "did not consistently impact" outcomes. VERIFIED (abstract).
3. Williams TD et al. Periodized vs non-periodized RT on maximal strength: meta-analysis. Sports Med 2017. DOI 10.1007/s40279-017-0734-y. 18 studies; small advantage of periodization for strength (abstract truncated before ES). VERIFIED (partial).
4. Grgic J et al. Should hypertrophy programs be periodized? Sci Sports 2018. DOI 10.1016/j.scispo.2017.09.005. Systematic review; no clear hypertrophy advantage. CONFIRMED by Crossref only (abstract not read): UNVERIFIED for content.
5. Coleman M et al. One-week deload in resistance-trained: PeerJ 2024;12:e16777. DOI 10.7717/peerj.16777. RCT n=39; no hypertrophy difference, continuous training had better strength gains. VERIFIED. Implication: planned deloads are not needed for most users.
6. Bell L et al. Overreaching and overtraining in strength sports and RT: scoping review. J Sports Sci 2020. DOI 10.1080/02640414.2020.1763077. Chronic high volume/intensity can cause non-functional overreaching; true OTS minimal evidence. VERIFIED.
7. Rogerson D et al. Deloading practices in strength and physique sports (survey). Sports Med Open 2024. DOI 10.1186/s40798-024-00691-y. Athletes deload about every 5.6 weeks for 6.4 days; descriptive only, no efficacy evidence. VERIFIED (shows practice, not efficacy).

**Confidence**: Moderate for load-increment rule (expert consensus + position stand); low for deload timing (no evidence of benefit; evidence of no harm skipping).

---

## 6. Exercise selection

### 6a. Multi-joint vs single-joint
**Rule**: Each session: 1-2 multi-joint lifts first (ACSM order: large before small, multi before single), then isolation for muscles that compounds under-train (biceps/triceps/calves/side delts/hamstrings knee-flexion/glute isolation). Beginners: mostly compounds/machines (3-5 exercises per session). Home/bodyweight: replace barbell with the closest pattern (goblet squat, split squat, push-up, DB row, DB RDL, hip thrust/bridge).
**Evidence**: Gentil P et al. Single vs multi-joint RT: Asian J Sports Med 2015. DOI 10.5812/asjsm.24057 (Crossref only; content not read: UNVERIFIED). Paoli A et al. Front Physiol 2017. DOI 10.3389/fphys.2017.01105 (Crossref only: UNVERIFIED). ACSM 2009 sequencing recommendation: VERIFIED. Weak direct evidence; rationale is time efficiency and ACSM exercise order.
**Confidence**: Low-moderate.

### 6b. Glutes: hip thrust vs squat
**Rule**: For glute emphasis include one hip-extension-dominant lift (hip thrust/bridge/RDL) and one squat/lunge pattern, each 2x/week; no evidence that hip thrust is superior to squat for hypertrophy, so choose by equipment and preference. Add a hip abduction exercise for glute medius (see caveat). Home: single-leg hip thrust/bridge, Bulgarian split squat, DB RDL.
**Evidence**
1. Plotkin D et al. Hip thrust and back squat training elicit similar gluteus muscle hypertrophy. Front Physiol 2023;14:1279170. DOI 10.3389/fphys.2023.1279170. RCT, 34 untrained adults, 9 weeks, set-volume equated; similar gluteus mCSA gains; squat better for quadriceps/adductors; gluteus medius/minimus and hamstrings grew little. VERIFIED.
2. Williams MJ et al. Gluteus maximus activation in back squat, split squat and barbell hip thrust. J Strength Cond Res 2021;35(1):16-24. DOI 10.1519/JSC.0000000000002651. Peak EMG higher in hip thrust; acute, n=12 male athletes. VERIFIED (EMG is weak evidence for hypertrophy).
3. Contreras B et al. EMG of glute max, biceps femoris, vastus lateralis in hip exercises. J Appl Biomech 2015. DOI 10.1123/jab.2014-0301. Crossref only (UNVERIFIED content).
**Confidence**: Moderate (hypertrophy parity); limited by one 9-week RCT in untrained participants. No peer-reviewed hypertrophy RCT supports a specific "glute-isolation" superiority.

### 6c. Stretched (long-length) position and ROM
**Rule**: Prefer full ROM with emphasis on the lengthened portion (deep squat/RDL, seated leg curl rather than prone, incline curl, overhead triceps extension, standing calf raise with full stretch). Optional lengthened partials on the last set of isolation exercises for intermediate/advanced. Do not use partial ROM as default for beginners.
**Evidence**
1. Maeo S et al. Greater hamstrings hypertrophy after training at long vs short muscle lengths. Med Sci Sports Exerc 2021. DOI 10.1249/MSS.0000000000002523. Within-subject RCT, n=20: whole hamstrings +14% (seated curl) vs +9% (prone). VERIFIED.
2. Pallares JG et al. Effects of ROM on RT adaptations: SR and meta-analysis. Scand J Med Sci Sports 2021;31:1866-81. DOI 10.1111/sms.14006. 16 studies; full ROM > partial for strength (ES 0.56) and lower-limb hypertrophy (ES 0.88). VERIFIED.
3. Kassiano W et al. Partial ROM at long muscle lengths, gastrocnemius. J Strength Cond Res 2023. DOI 10.1519/JSC.0000000000004460. RCT n=42 women; initial (lengthened) partial ROM +15.2% medial gastrocnemius vs +6.7% full ROM. VERIFIED.
4. Pedrosa GF et al. Partial ROM at long muscle lengths, knee extension. Eur J Sport Sci 2022. DOI 10.1080/17461391.2021.1927199. RCT n=45 untrained women. VERIFIED.
5. Varovic M et al. Does muscle length influence regional hypertrophy? SR + Bayesian meta-analysis. Int J Sports Med 2025. DOI 10.1055/a-2615-4935. 12 studies; trivial differences between shorter and longer mean muscle lengths (practical equivalence). VERIFIED. Counterweight: overall meta-analysis does not support a large advantage.
6. Wolf M et al. Partial vs full ROM RT: SR + meta-analysis. Int J Strength Cond 2023. DOI 10.47206/ijsc.v3i1.182. Crossref only: UNVERIFIED content.
7. ACSM 2026 abstract: strength enhanced by a complete ROM.
**Confidence**: Moderate for "full ROM or lengthened emphasis is at least as good"; low for any claim of a large lengthened advantage.

---

## 7. Warm-up

**Rule**
- Session start: 3-5 min light general warm-up (cycling, brisk walk, jumping jacks), then 1-3 ramp-up sets on the first compound lift (about 50%, 70%, 85% of working load; reps 8, 5, 3), then go to working sets. Later exercises: 1 light set only if the pattern is new or the load is heavy.
- Warm-up sets are not counted toward weekly volume.
- Do not require static stretching before lifting.
- Model as a "warm-up checks" step list: general warm-up, joint-specific mobility for limitations, ramp-up sets.

**Evidence**
1. Fradkin AJ et al. Effects of warming-up on physical performance: SR with meta-analysis. J Strength Cond Res 2010. DOI 10.1519/JSC.0b013e3181c643a0. 32 studies; warm-up improved performance in 79% of criteria; little evidence of harm. VERIFIED (older than 10 years).
2. Neves et al. Acute effects of RT warm-up and re-warm-up on dynamic strength: scoping review. J Sci Sport Exerc 2026. DOI 10.1007/s42978-025-00361-9. Crossref only: UNVERIFIED content.
3. McCrary JM et al. BJSM 2015 meta-analysis on warm-up/stretching: could NOT locate a matching DOI in Crossref; UNVERIFIED, do not cite.
4. Injury-prevention benefit of warm-up for lifting is weakly supported; ramp-up sets are practical consensus (no RCT-level evidence found).
**Confidence**: Moderate for performance benefit; low for injury prevention and for specific ramp-up percentages.

---

## 8. Concurrent training and cardio dose

**Rule**
- Hypertrophy/strength goals: strength first priority; cardio 2 sessions/wk of 20-30 min moderate (or 1 HIIT), separated from lifting by >=3 h or on separate days when possible; if same session, lifting first.
- General health: 150-300 min/wk moderate aerobic (or 75-150 vigorous) + 2 strength days (WHO). Default 150 min/wk, scheduled as `timed` cardio steps (e.g., 30 min x 3-5 days).
- Fat loss: 150-250 min/wk moderate cardio minimum, progressing toward >250 min/wk for clinically meaningful weight loss; keep RT 2-4 d/wk to preserve lean mass; avoid energy deficit >~500 kcal/day when muscle gain is also a goal. Prefer low-impact cardio for beginners (walking, cycling).
- Daily step/active time is the cheapest cardio dose for beginners: add a walking item.

**Evidence**
1. Schumann M et al. Compatibility of concurrent aerobic and strength training: updated SR + meta-analysis. Sports Med 2022;52:601-12. DOI 10.1007/s40279-021-01587-7. 43 studies; max strength SMD -0.06 (ns), hypertrophy -0.01 (ns), explosive strength -0.28 (attenuated, more when done in the same session). VERIFIED.
2. Donnelly JE et al. ACSM Position Stand: physical activity strategies for weight loss and weight regain prevention. Med Sci Sports Exerc 2009. DOI 10.1249/MSS.0b013e3181949333. 150-250 min/wk modest loss; >250 min/wk clinically significant loss; RT does not enhance weight loss but may increase FFM. VERIFIED (older than 10 years but still the ACSM statement).
3. Murphy C, Koehler K. Energy deficiency impairs RT gains in lean mass but not strength. Scand J Med Sci Sports 2022. DOI 10.1111/sms.14075. Meta-regression; ~500 kcal/day deficit prevented lean-mass gains. VERIFIED.
4. Morton RW et al. Protein supplementation and RT gains. Br J Sports Med 2018;52:376-84. DOI 10.1136/bjsports-2017-097608. 49 studies; no further gains above ~1.6 g/kg/day. VERIFIED. Useful only as a nutrition note, outside the generator.
5. Garber CE et al. ACSM Position Stand: quantity and quality of exercise. Med Sci Sports Exerc 2011. DOI 10.1249/MSS.0b013e318213fefb. >=150 min/wk moderate cardio; RT 2-3 d/wk. VERIFIED.
6. Momma H et al. Muscle-strengthening activities and mortality/NCD risk. Br J Sports Med 2022. DOI 10.1136/bjsports-2021-105061. 16 cohorts; 10-17% lower risk; max benefit at about 30-60 min/wk of muscle-strengthening. VERIFIED. Supports a minimum effective RT dose of 2 sessions of ~30 min.
**Confidence**: High (hypertrophy not impaired by concurrent training; WHO/ACSM cardio dose); moderate (fat-loss cardio numbers; evidence is dominated by diet).

---

## 9. Public-health guidelines

**WHO 2020** (Bull FC et al., Br J Sports Med 2020;54:1451-62, DOI 10.1136/bjsports-2020-102955, published 2020-11-25). DOI resolved; content VERIFIED (secondary, via PMC7719906 summary). Adults 18-64: 150-300 min/wk moderate OR 75-150 min/wk vigorous aerobic (strong recommendation); muscle-strengthening at moderate or greater intensity, major muscle groups, >=2 d/wk (strong); beyond 300 min moderate gives extra benefit (conditional); limit sedentary time (strong). Older adults (65+): same plus multicomponent balance/functional strength >=3 d/wk. Pregnancy/postpartum: 150 min moderate/week. Chronic conditions: guidelines apply; seek professional advice for individual needs.

**ACSM**: see section 0 (2026 RT stand supersedes 2009). ACSM/AHA-era aerobic guidance remains Garber 2011.

**Rule**: Every generated plan must report weekly totals against WHO: aerobic minutes and number of strengthening days (>=2), and warn when below.

**Confidence**: High.

---

## 10. Safety and pre-participation screening

**Rule**: Show a short PAR-Q+-based screen before generating a plan. If all seven General Health Questions = NO: proceed. If any YES: do not generate silently; show "talk to a doctor or qualified exercise professional first" with an option to continue only with a low-intensity beginner template and an explicit acknowledgement. Never present the app as medical clearance. [DESIGN, owner decision] A YES to question 2 (chest pain) or 7 (only medically supervised activity) BLOCKS generation and shows a referral message; any other YES allows only the gentle routine (machines + body weight, 3-4 RIR, no loaded hinge, no ramp-up sets).

**Sources**
1. PAR-Q+ (PAR-Q+ Collaboration, 2025 form, copyright 2025; version dated 2024-11-01), official 7 General Health Questions and follow-up logic. VERIFIED (text read from the form PDF hosted at southlake.ca; official site is eparmedx.com). Base paper: Warburton DER et al. Evidence-based risk assessment and recommendations for physical activity clearance: Consensus Document 2011. Appl Physiol Nutr Metab 36(S1):S266-S298. DOI 10.1139/h11-062. VERIFIED.
2. Riebe D et al. Updating ACSM's recommendations for exercise preparticipation health screening. Med Sci Sports Exerc 2015;47(11):2473-9. DOI 10.1249/MSS.0000000000000664. VERIFIED. Model uses: (1) current physical activity level, (2) signs/symptoms or known cardiovascular, metabolic, or renal disease, (3) desired intensity; risk-factor profiling dropped. Not used as the primary screen because it needs clinician-style interpretation, but its logic is compatible: refer when signs/symptoms or known CV/metabolic/renal disease and not currently active.

### Screening questions (PAR-Q+ General Health Questions; wording of the form, parenthetical hints condensed to "NO if ..." here and phrased "Answer NO if ..." in the app)
| # | Question | Trigger |
|---|---|---|
| 1 | Has your doctor ever said that you have a heart condition OR high blood pressure? | YES -> follow-up / refer |
| 2 | Do you feel pain in your chest at rest, during your daily activities of living, OR when you do physical activity? | YES -> follow-up / refer (treat as stop-and-see-doctor in-app) |
| 3 | Do you lose balance because of dizziness OR have you lost consciousness in the last 12 months? (NO if dizziness was from over-breathing, including during vigorous exercise) | YES -> follow-up / refer |
| 4 | Have you ever been diagnosed with another chronic medical condition (other than heart disease or high blood pressure)? | YES -> follow-up |
| 5 | Are you currently taking prescribed medications for a chronic medical condition? | YES -> follow-up |
| 6 | Do you currently have (or have had within the past 12 months) a bone, joint, or soft tissue (muscle, ligament, or tendon) problem that could be made worse by becoming more physically active? (NO if past problem no longer limits you) | YES -> follow-up; also feeds the "limitations" input |
| 7 | Has your doctor ever said that you should only do medically supervised physical activity? | YES -> refer |

Outcome rules from the form: all NO -> cleared; start slowly, build up gradually; over 45 and unaccustomed to vigorous exercise -> consult a qualified exercise professional before vigorous intensity. Any YES -> answer the follow-up questions; YES to a follow-up item -> "seek further information before becoming more active" (ePARmed-X+ / qualified exercise professional). Delay if: temporary illness (cold/fever), pregnancy (talk to a practitioner / complete ePARmed-X+), or health changes. Clearance valid max 12 months.

### Follow-up triggers worth encoding (from the PAR-Q+ 2025 form; YES = refer)
- Arthritis/osteoporosis/back: hard to control; joint pain, recent fracture, displaced vertebra/spondylolysis; steroids >3 months.
- Cancer: lung, myeloma, head/neck types; current chemo/radiotherapy.
- Heart/CV: condition not controlled; irregular heartbeat needing management; chronic heart failure; coronary artery disease and inactive >2 months.
- High blood pressure: not controlled; resting BP >=160/90 (or unknown).
- Metabolic (diabetes, pre-diabetes): poor glucose control; post-exercise hypoglycemia symptoms; complications; other metabolic conditions; planning unusually vigorous exercise.
- Mental health/learning difficulties: not controlled; Down syndrome with back/nerve problems.
- Respiratory: not controlled; low oxygen/oxygen therapy; asthma symptoms (>2 days/week) or rescue inhaler >2 times last week; pulmonary hypertension.
- Spinal cord injury; stroke (impaired mobility, or event in last 6 months); other condition: recent head injury/concussion in 12 months, unlisted conditions (epilepsy, kidney), or two or more conditions.

Additional in-app red flags (stop session, seek care): chest pain/pressure, fainting, severe dyspnea, new neurological symptoms. [DESIGN, standard consensus content; consistent with PAR-Q+ Q2/Q3]

**Confidence**: High for the questionnaire content; moderate for the claim that screening improves safety (the 2011 consensus and 2015 ACSM paper both argue exercise is safe for most people and screening should minimize barriers).

---

## 11. Beginner program design (full body vs split)

**Rule**
- Beginners (and intermediate with <=3 days): full-body sessions, 2-3 days/week on non-consecutive days, 5-7 exercises or ~12-16 hard sets per session, one set of each major pattern, so each muscle is trained 2x/week.
- 4 days: upper/lower. 5-6 days (advanced only): upper/lower + push/pull/legs or body-part specialization for the priority muscle.
- Session time budget: ~6-8 working sets per 15 minutes of lifting (about 2-2.5 min per set including rest). [DESIGN, arithmetic from rest defaults]
- Week 1-2: stay at 3-4 RIR (technique/familiarization), then move to 2-3 RIR. [DESIGN]
- Fat-loss and general-health beginners: 2 full-body days + walking/cardio.

**Evidence**
1. Currier 2023 BJSM: multiset, twice weekly ranks top for hypertrophy. VERIFIED.
2. Evangelista AL et al. Split or full-body workout routine: which is best? Einstein (Sao Paulo) 2021. DOI 10.31744/einstein_journal/2021ao5781. RCT n=67 untrained, 8 weeks; split (2x) vs full-body (4x) with equal weekly sets gave similar strength and hypertrophy. VERIFIED.
3. Schoenfeld 2019 (frequency, section 2): split/full-body is a preference once volume is equal. VERIFIED.
4. ACSM 2009: novices 2-3 d/wk, full-body, 8-12 RM. VERIFIED. WHO 2020: >=2 d/wk strengthening. VERIFIED.
5. Momma 2022 BJSM: 30-60 min/wk of muscle strengthening yields most of the mortality benefit. VERIFIED.
**Confidence**: High that full body vs split is equivalent at equal volume; moderate for beginner defaults (extrapolation from short trials in untrained participants).

---

## 12. Default parameter table (goal x level)

Sets = direct-equivalent hard sets per muscle per week; indirect sets counted at 0.5. RIR = target proximity to failure on working sets. Rest in seconds (compound / isolation). Cardio per week.

| Goal | Level | Days/wk | Freq per muscle | Sets/muscle/wk | Reps (compound / isolation) | RIR | Rest (s) | Cardio |
|---|---|---|---|---|---|---|---|---|
| Hypertrophy (region priority) | Beginner | 3 (full body) | 2 | 8-10 (priority +2) | 8-12 / 10-15 | 2-3 | 120 / 75 | 1-2 x 20-30 min easy |
| Hypertrophy | Intermediate | 4 (upper/lower) | 2 | 10-14 (priority +3) | 6-12 / 10-20 | 1-3 | 150 / 75 | 2 x 20-30 min |
| Hypertrophy | Advanced | 4-5 | 2 (3 for priority) | 12-18 (priority +4, cap 20) | 5-12 / 8-20 | 0-3 | 180 / 90 | 2 x 20-30 min |
| General strength | Beginner | 3 (full body) | 2-3 (main lifts) | 6-8 per main lift pattern | 5-8 | 2-3 | 150-180 | 1-2 x 20-30 min |
| General strength | Intermediate | 3-4 | 2-3 | 8-10 | 3-8 | 1-3 | 180 | 2 x 20-30 min |
| General strength | Advanced | 4 | 3 | 8-12 (cap, diminishing) | 2-6 (>=80% 1RM on main lift) | 1-2 | 180-240 | 2 x 20-30 min |
| Fat loss | Beginner | 2-3 full body + cardio | 2 | 4-6 | 8-15 | 2-3 | 90 / 60 | >=150 min/wk moderate, progress toward 250 |
| Fat loss | Intermediate / advanced | 3-4 | 2 | 6-10 | 6-15 | 1-3 | 120 / 60 | 150-250 min/wk (HIIT optional 1x) |
| General health (WHO) | All | 2-3 | 2 | 4-8 | 8-15 | 2-3 | 90 / 60 | 150-300 min moderate or 75-150 vigorous |

Equipment overrides: gym = barbells/machines/cables; home dumbbells = goblet/split squat, DB RDL, DB press, row, hip thrust with DB, reps up to 15-25 per set, incrementKg 1-2; bodyweight = push-up/inverted row/split squat/single-leg bridge variants, reps 10-30 at 2 RIR, progress by leverage and tempo. Time budget: sets per session = floor(sessionMinutes - warmup 5 min) / ~2.5 min per set (compound) or 1.75 min (isolation). If volume does not fit, reduce volume of non-priority muscles first; never reduce rest below 60 s.

Limitation overrides [DESIGN]: replace, never silently drop, exercises that load the limited joint (e.g., knee pain: box squat, hip thrust, leg curl, shallow ROM; shoulder pain: neutral-grip, landmine/machine press; low back: supported rows, machine hinges). Any PAR-Q+ Q6 YES -> show a professional-advice banner.

---

## 13. Limitations and weak evidence

1. Most trials: young (mean age ~25), male-skewed (Pelland: 79% male), short (6-12 weeks), mostly untrained. Extrapolation to women, older adults, and advanced lifters is limited. No evidence-based menstrual-cycle adjustments (not searched thoroughly; do not encode).
2. Volume bands by level are interpolations; the literature models a continuous dose-response and trained/untrained is a covariate, not a separate curve. ACSM 2026 only states ">=10 sets/wk" for hypertrophy.
3. Proximity to failure: RIR is estimated, accuracy worsens far from failure (Hackett 2017) and for novices (Zourdos 2016). Robinson 2024 suggests a small advantage nearer failure for hypertrophy, Refalo 2023 and Grgic 2022 find no failure advantage. The 1-3 RIR range is a compromise.
4. Double progression, increment sizes, ramp-up percentages, deload timing, session-volume caps, week-1/2 RIR: practice-based; no RCT evidence. ACSM 2009's 2-10% rule is the only citable anchor.
5. Deloads and periodization: no demonstrated benefit for novices or trained lifters in the cited trials; periodization shows at most a small strength edge.
6. Glute-specific evidence is thin (one 9-week RCT in untrained adults; EMG studies are acute). Gluteus medius/minimus grew little with squat or hip thrust, but no RCT validates a specific abductor protocol.
7. Long-length training: individual RCTs favor lengthened positions (hamstrings, gastrocnemius, quads) but the pooled regional-hypertrophy meta-analysis (Varovic 2025) shows near-equivalence; do not claim superiority.
8. Home/bodyweight programming: almost no direct trials; extrapolated from the finding that hypertrophy is load-independent when sets are near failure (Schoenfeld 2017, Lopez 2021), with the caveat that strength gains lag with light loads.
9. Fat loss: body-composition change is dominated by energy balance; exercise-only effects are modest (ACSM 2009: RT does not enhance weight loss). The generator should not promise fat loss from training alone; nutrition is out of scope.
10. ACSM 2026 full text was not read; only the abstract (Europe PMC) and secondary summaries. WHO 2020 was verified via a secondary summary (PMC7719906) and DOI resolution, not the full guideline PDF.
11. Several items seen only via Crossref metadata and therefore content-unverified: Gentil 2015, Paoli 2017, Contreras 2015, Wolf 2023, Grgic 2018 (periodization), Neves 2026, Sports Med Sci Sports preprints (SportRxiv versions of Pelland/Singer/Robinson exist: 10.51224/srxiv.460, .395, .295).
12. Not located / unverified: McCrary 2015 BJSM warm-up meta-analysis; exact Pelland predicted-gain numbers; the WHO full guideline text; ACSM 2026 full recommendation tables.
13. Preprints and 2026 items must be re-checked before release (e.g., SportRxiv 2026 Boutagy weekly volume preprint, DOI 10.51224/sportrxiv.1100, was seen only as a title: UNVERIFIED, not used).
14. Cowley et al. Sports Med 2026 (DOI 10.1007/s40279-026-02428-1) network meta-analysis: advanced RT methods (drop sets, cluster sets, etc.) show no clear benefit over traditional RT in untrained to moderately trained people. VERIFIED (abstract). Supports not adding advanced techniques to the generator.

---

## 14. Source tally

Verified (DOI resolved and abstract read): 36 (ACSM 2026, ACSM 2009, ACSM 2011, ACSM 2009 weight, Pelland 2025, Schoenfeld 2017 volume, Schoenfeld 2019 frequency, Grgic 2018 frequency, Ralston 2017, Ralston 2018, Currier 2023, Schoenfeld 2017 load, Lopez 2021, Schoenfeld 2021, Refalo 2023, Robinson 2024, Grgic 2022, Hackett 2017, Zourdos 2016, Singer 2024, Grgic 2017 rest, Schoenfeld 2016 rest, Krieger 2010, Schoenfeld 2019 volume RCT, Androulakis-Korakakis 2020, Williams 2017, Coleman 2024, Bell 2020, Rogerson 2024, Plotkin 2023, Williams 2021 EMG, Maeo 2021, Pallares 2021, Kassiano 2023, Pedrosa 2022, Varovic 2025, Schumann 2022, Murphy 2022, Morton 2018, Momma 2022, Fradkin 2010, Evangelista 2021, Cowley 2026, Warburton 2011, Riebe 2015, PAR-Q+ 2025 form).
Verified (secondary): WHO 2020 (Bull 2020).
Unverified or metadata-only: Gentil 2015, Paoli 2017, Contreras 2015, Wolf 2023, Grgic 2018 periodization, Neves 2026, McCrary 2015 (not located), Boutagy 2026 (preprint), Pelland numeric curves, ACSM 2026 full tables.
