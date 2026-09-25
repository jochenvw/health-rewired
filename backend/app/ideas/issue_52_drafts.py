"""Deterministic post-MDT explanations for idea 52.

Used when the Copilot SDK is not configured or does not return a draft, so the walkthrough works
without a token. All text is SYNTHETIC and belongs to the fictional cases in /sample-data.
The patient text exists in Dutch, Italian and English at two reading levels; the GP letter is the
German hospital letter, which must say the same thing as the patient version.
"""

from typing import Any

# One entry per synthetic patient:
#   gp         – sentences of the German GP letter, each linked to a source document
#   languages  – patient sentences per language and reading level + comprehension questions
DRAFTS: dict[str, dict[str, Any]] = {
    "P-010": {
        "headline": {
            "nl": "Uitleg voor Sanne de Vries – afwachten of opereren",
            "it": "Spiegazione per Sanne de Vries – attesa vigile o intervento",
            "en": "Explanation for Sanne de Vries – watch-and-wait or surgery",
        },
        "gp": [
            {
                "text": (
                    "Restaging nach kompletter neoadjuvanter Radiochemotherapie (50,4 Gy mit Capecitabin, "
                    "abgeschlossen am 22.12.2025) zeigt ein nahezu komplettes Ansprechen."
                ),
                "source_id": "mdt",
            },
            {
                "text": "MRT vom 04.03.2026: mrTRG 2, Restbefund 11 mm Fibrose, mesorektale Faszie frei (7 mm).",
                "source_id": "mri",
            },
            {
                "text": (
                    "Endoskopie und Biopsien vom 05.03.2026 ohne Nachweis vitaler Tumorzellen; CEA 4,1 → 2,2 ng/mL."
                ),
                "source_id": "pathology",
            },
            {
                "text": (
                    "Das Tumorboard bietet eine partizipative Entscheidung zwischen Watch-and-Wait mit "
                    "3-monatlicher MRT und Endoskopie und totaler mesorektaler Exzision an."
                ),
                "source_id": "mdt",
            },
            {
                "text": (
                    "Ein Rezidiv im Rahmen von Watch-and-Wait tritt bei etwa einem von vier Patienten auf, "
                    "meist in den ersten zwei Jahren, und ist bei rechtzeitiger Entdeckung weiterhin operabel."
                ),
                "source_id": "mdt",
            },
            {
                "text": (
                    "Bitte unterstützen Sie die Patientin bei der Entscheidung; die Nachsorgetermine werden "
                    "von uns organisiert, eine Entscheidung ist am Tumorboard nicht getroffen worden."
                ),
                "source_id": "mdt",
            },
        ],
        "languages": {
            "nl": {
                "simple": [
                    {
                        "text": "De bestraling met chemotherapie is klaar. De tumor is bijna helemaal weg.",
                        "source_id": "mdt",
                    },
                    {
                        "text": "Op de MRI van 4 maart zien we alleen nog een klein litteken van 11 millimeter.",
                        "source_id": "mri",
                    },
                    {
                        "text": "In de stukjes weefsel die we hebben onderzocht, zagen we geen kankercellen meer.",
                        "source_id": "pathology",
                        "risk": "Negative biopsies do not prove the tumour is gone – say this out loud.",
                    },
                    {
                        "text": "U kunt nu kiezen: wachten en goed controleren, of toch opereren.",
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "Wachten betekent: elke drie maanden een MRI en een kijkonderzoek. Geen operatie, "
                            "geen stoma."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": ("Bij ongeveer 1 op de 4 mensen komt de tumor terug. Dan kunnen we alsnog opereren."),
                        "source_id": "mdt",
                        "risk": "Patients often hear '1 in 4' as 'the cancer comes back for sure'.",
                    },
                    {
                        "text": (
                            "Opereren geeft de meeste zekerheid, maar is een zware operatie met vaak een "
                            "tijdelijk stoma."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": "U hoeft vandaag niet te kiezen. We beslissen samen, in uw tempo.",
                        "source_id": "mdt",
                    },
                ],
                "detailed": [
                    {
                        "text": (
                            "U heeft de volledige voorbehandeling gekregen: bestraling (50,4 Gy) met capecitabine, "
                            "afgerond op 22 december 2025."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "De MRI van 4 maart 2026 laat een bijna volledige respons zien (mrTRG 2): waar eerst "
                            "een tumor van 34 mm zat, is nu 11 mm littekenweefsel te zien."
                        ),
                        "source_id": "mri",
                    },
                    {
                        "text": (
                            "Bij het kijkonderzoek van 5 maart is alleen een vlak, wit litteken gezien; de "
                            "biopten bevatten geen tumorcellen. Zulke biopten sluiten resttumor dieper in de "
                            "darmwand niet volledig uit."
                        ),
                        "source_id": "pathology",
                        "risk": "The limits of a negative biopsy are the most misunderstood part of this case.",
                    },
                    {
                        "text": (
                            "Het multidisciplinair overleg vindt twee wegen gelijkwaardig: nauwkeurig vervolgen "
                            "(watch-and-wait) of de endeldarm operatief verwijderen (TME)."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "Bij watch-and-wait krijgt u de eerste twee jaar elke drie maanden een MRI en een "
                            "kijkonderzoek; daarna minder vaak. Uw eigen endeldarm blijft behouden."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "De tumor groeit bij ongeveer 25% van de mensen terug, bijna altijd in de eerste twee "
                            "jaar, en is dan in de meeste gevallen alsnog goed te opereren."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "Een TME-operatie geeft de meeste zekerheid over wat er nog achterblijft, maar betekent "
                            "een grote ingreep, meestal een tijdelijk stoma, kans op blijvende veranderingen in "
                            "ontlasting en seksuele functie, en 4 tot 6 weken herstel."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "De overleving op lange termijn is naar verwachting vergelijkbaar; watch-and-wait vraagt "
                            "wel dat u alle controles nakomt."
                        ),
                        "source_id": "mdt",
                    },
                ],
                "questions": [
                    {
                        "question": "Wat gebeurt er als u kiest voor afwachten?",
                        "expected_answer": "Elke drie maanden MRI en kijkonderzoek, geen operatie nu.",
                    },
                    {
                        "question": "Wat betekent het dat er geen kankercellen in de biopten zaten?",
                        "expected_answer": "Het is een goed teken, maar geen bewijs dat alles weg is.",
                    },
                    {
                        "question": "Kan er nog geopereerd worden als de tumor terugkomt?",
                        "expected_answer": "Ja, als we het op tijd zien bij de controles.",
                    },
                ],
            },
            "it": {
                "simple": [
                    {
                        "text": "La radioterapia con chemioterapia è finita. Il tumore è quasi del tutto scomparso.",
                        "source_id": "mdt",
                    },
                    {
                        "text": "Nella risonanza del 4 marzo si vede solo una piccola cicatrice di 11 millimetri.",
                        "source_id": "mri",
                    },
                    {
                        "text": "Nei campioni esaminati non abbiamo trovato cellule tumorali.",
                        "source_id": "pathology",
                        "risk": "Negative biopsies do not prove the tumour is gone – say this out loud.",
                    },
                    {
                        "text": "Ora può scegliere: aspettare con controlli frequenti, oppure operare.",
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "Aspettare significa: risonanza ed endoscopia ogni tre mesi. Nessuna operazione, "
                            "nessuna stomia."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": "In circa 1 persona su 4 il tumore torna. In quel caso possiamo ancora operare.",
                        "source_id": "mdt",
                        "risk": "Patients often hear '1 in 4' as 'the cancer comes back for sure'.",
                    },
                    {
                        "text": (
                            "L'operazione dà più certezza, ma è un intervento importante, spesso con una stomia "
                            "temporanea."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": "Non deve decidere oggi. Decidiamo insieme, con i suoi tempi.",
                        "source_id": "mdt",
                    },
                ],
                "detailed": [
                    {
                        "text": (
                            "Ha completato tutto il trattamento preoperatorio: radioterapia (50,4 Gy) con "
                            "capecitabina, terminata il 22 dicembre 2025."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "La risonanza del 4 marzo 2026 mostra una risposta quasi completa (mrTRG 2): dove "
                            "c'era un tumore di 34 mm ora si vede una cicatrice di 11 mm."
                        ),
                        "source_id": "mri",
                    },
                    {
                        "text": (
                            "L'endoscopia del 5 marzo ha mostrato solo una cicatrice piatta e bianca; le biopsie "
                            "non contengono cellule tumorali. Queste biopsie non escludono del tutto un residuo "
                            "più profondo nella parete."
                        ),
                        "source_id": "pathology",
                        "risk": "The limits of a negative biopsy are the most misunderstood part of this case.",
                    },
                    {
                        "text": (
                            "Il gruppo multidisciplinare considera equivalenti due strade: sorveglianza attiva "
                            "(watch-and-wait) oppure asportazione chirurgica del retto (TME)."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "Con la sorveglianza attiva farà risonanza ed endoscopia ogni tre mesi per due anni, "
                            "poi più di rado, conservando il proprio retto."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "Il tumore ricresce in circa il 25% delle persone, quasi sempre nei primi due anni, e "
                            "in quel caso resta operabile se individuato in tempo."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "L'intervento TME offre la massima certezza, ma è un'operazione importante, di solito "
                            "con stomia temporanea, con rischio di disturbi intestinali e sessuali duraturi e 4-6 "
                            "settimane di recupero."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "La sopravvivenza a lungo termine è attesa simile nelle due strade; la sorveglianza "
                            "richiede però di rispettare tutti i controlli."
                        ),
                        "source_id": "mdt",
                    },
                ],
                "questions": [
                    {
                        "question": "Che cosa succede se sceglie la sorveglianza attiva?",
                        "expected_answer": "Risonanza ed endoscopia ogni tre mesi, nessuna operazione adesso.",
                    },
                    {
                        "question": "Che cosa significa che le biopsie erano negative?",
                        "expected_answer": "È un buon segno, ma non è la prova che tutto sia scomparso.",
                    },
                    {
                        "question": "Si può ancora operare se il tumore torna?",
                        "expected_answer": "Sì, se lo troviamo in tempo durante i controlli.",
                    },
                ],
            },
            "en": {
                "simple": [
                    {
                        "text": "Your radiotherapy with chemotherapy is finished. The tumour has almost disappeared.",
                        "source_id": "mdt",
                    },
                    {
                        "text": "The MRI of 4 March shows only a small scar of 11 millimetres.",
                        "source_id": "mri",
                    },
                    {
                        "text": "We found no cancer cells in the tissue samples we looked at.",
                        "source_id": "pathology",
                        "risk": "Negative biopsies do not prove the tumour is gone – say this out loud.",
                    },
                    {"text": "You can now choose: wait with close checks, or have an operation.", "source_id": "mdt"},
                    {
                        "text": "Waiting means an MRI and a camera test every three months. No operation, no stoma.",
                        "source_id": "mdt",
                    },
                    {
                        "text": "In about 1 in 4 people the tumour comes back. We can still operate then.",
                        "source_id": "mdt",
                        "risk": "Patients often hear '1 in 4' as 'the cancer comes back for sure'.",
                    },
                    {
                        "text": (
                            "An operation gives the most certainty, but it is "
                            "major surgery, often with a temporary stoma."
                        ),
                        "source_id": "mdt",
                    },
                    {"text": "You do not have to choose today. We decide together, at your pace.", "source_id": "mdt"},
                ],
                "detailed": [
                    {
                        "text": (
                            "You completed the full pre-operative treatment: radiotherapy (50.4 Gy) with "
                            "capecitabine, finished on 22 December 2025."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "The MRI of 4 March 2026 shows a near-complete response (mrTRG 2): an 11 mm scar where "
                            "a 34 mm tumour used to be."
                        ),
                        "source_id": "mri",
                    },
                    {
                        "text": (
                            "Endoscopy on 5 March showed a flat white scar and the biopsies contained no tumour "
                            "cells. Such biopsies cannot fully exclude tumour deeper in the bowel wall."
                        ),
                        "source_id": "pathology",
                        "risk": "The limits of a negative biopsy are the most misunderstood part of this case.",
                    },
                    {
                        "text": (
                            "The tumour board considers two paths equivalent: close surveillance (watch-and-wait) "
                            "or surgical removal of the rectum (TME)."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "With watch-and-wait you have an MRI and endoscopy every three months for two years, "
                            "then less often, and you keep your own rectum."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "The tumour regrows in about 25% of people, almost always within the first two years, "
                            "and can usually still be operated on if found in time."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "TME surgery gives the most certainty about what is left behind, but it is a major "
                            "operation, usually with a temporary stoma, a risk of lasting bowel and sexual "
                            "changes, and 4 to 6 weeks of recovery."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "Long-term survival is expected to be similar in both paths, but watch-and-wait only "
                            "works if you attend every check-up."
                        ),
                        "source_id": "mdt",
                    },
                ],
                "questions": [
                    {
                        "question": "What happens if you choose to wait and be monitored?",
                        "expected_answer": "An MRI and camera test every three months, no operation now.",
                    },
                    {
                        "question": "What does it mean that the biopsies showed no cancer cells?",
                        "expected_answer": "It is a good sign, but not proof that everything is gone.",
                    },
                    {
                        "question": "Can you still be operated on if the tumour comes back?",
                        "expected_answer": "Yes, if we find it in time during the check-ups.",
                    },
                ],
            },
        },
    },
    "P-011": {
        "headline": {
            "nl": "Uitleg voor Giulia Moretti – chemotherapie met antilichaam",
            "it": "Spiegazione per Giulia Moretti – chemioterapia con anticorpo",
            "en": "Explanation for Giulia Moretti – chemotherapy with an antibody",
        },
        "gp": [
            {
                "text": (
                    "Sigmakarzinom cT4a cN2 M1a mit vier Lebermetastasen (Segment VII/VIII, größte 42 mm), "
                    "RAS- und BRAF-Wildtyp, pMMR, HER2 negativ."
                ),
                "source_id": "pathology",
            },
            {
                "text": (
                    "MRT der Leber vom 03.03.2026: aktuell technisch nicht resektabel, Konversion nach "
                    "Systemtherapie möglich."
                ),
                "source_id": "imaging",
            },
            {
                "text": (
                    "Tumorboardbeschluss: Beginn FOLFOX plus Panitumumab, Restaging mit Leber-MRT nach vier "
                    "Zyklen, danach erneute Vorstellung im Board zur Resektion."
                ),
                "source_id": "mdt",
            },
            {
                "text": "Port-Implantation vor Zyklus 1; Zyklus 1 geplant am 16.03.2026. Keine primäre Darmoperation.",
                "source_id": "mdt",
            },
            {
                "text": (
                    "Die Patientin wurde auf Italienisch mit Dolmetscher aufgeklärt; dieser Brief entspricht "
                    "inhaltlich der Erklärung, die sie erhalten hat."
                ),
                "source_id": "mdt",
            },
        ],
        "languages": {
            "it": {
                "simple": [
                    {
                        "text": "Il tumore è partito dall'intestino e si è diffuso al fegato, in quattro punti.",
                        "source_id": "imaging",
                    },
                    {
                        "text": (
                            "Oggi queste zone del fegato non si possono operare, perché sono vicine a una vena grande."
                        ),
                        "source_id": "imaging",
                    },
                    {
                        "text": "Iniziamo una cura con chemioterapia e un anticorpo, per farle diventare più piccole.",
                        "source_id": "mdt",
                    },
                    {
                        "text": "L'anticorpo funziona perché le analisi del tumore sono RAS e BRAF normali.",
                        "source_id": "pathology",
                    },
                    {
                        "text": "Dopo quattro cicli rifacciamo la risonanza e vediamo se si può operare il fegato.",
                        "source_id": "mdt",
                        "risk": "'We will see' can be heard as a promise of surgery.",
                    },
                    {
                        "text": "Prima della cura mettiamo un piccolo accesso sotto la pelle (port) per le flebo.",
                        "source_id": "mdt",
                    },
                    {
                        "text": "L'intestino non va operato adesso, perché non è chiuso.",
                        "source_id": "mdt",
                    },
                ],
                "detailed": [
                    {
                        "text": (
                            "La diagnosi è un adenocarcinoma del sigma (cT4a cN2) con quattro metastasi epatiche "
                            "nei segmenti VII e VIII, la maggiore di 42 mm."
                        ),
                        "source_id": "imaging",
                    },
                    {
                        "text": (
                            "Due lesioni sono vicine alla vena epatica destra: oggi un intervento sul fegato non è "
                            "tecnicamente possibile, ma può diventarlo se le metastasi si riducono."
                        ),
                        "source_id": "imaging",
                    },
                    {
                        "text": (
                            "Il tumore è RAS e BRAF wild-type e si trova nel colon sinistro: è la situazione in cui "
                            "l'anticorpo anti-EGFR panitumumab aggiunge beneficio alla chemioterapia."
                        ),
                        "source_id": "pathology",
                    },
                    {
                        "text": (
                            "Il piano del gruppo multidisciplinare è FOLFOX con panitumumab, una flebo ogni due "
                            "settimane, con l'obiettivo di ridurre le metastasi (strategia di conversione)."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "Dopo quattro cicli ripetiamo la risonanza del fegato e il caso torna al gruppo "
                            "multidisciplinare per valutare l'operazione: non è una decisione già presa."
                        ),
                        "source_id": "mdt",
                        "risk": "'We will see' can be heard as a promise of surgery.",
                    },
                    {
                        "text": (
                            "Effetti collaterali attesi: stanchezza, formicolio alle mani e ai piedi con il freddo, "
                            "eruzione cutanea sul viso dovuta all'anticorpo, calo dei globuli bianchi."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "Prima del primo ciclo verrà posizionato un port-a-cath; il primo ciclo è previsto per "
                            "il 16 marzo 2026. L'intestino non viene operato ora perché non c'è occlusione."
                        ),
                        "source_id": "mdt",
                    },
                ],
                "questions": [
                    {
                        "question": "Perché il fegato non viene operato subito?",
                        "expected_answer": "Perché le metastasi sono vicine a una vena grande; prima vanno ridotte.",
                    },
                    {
                        "question": "Che cosa succede dopo quattro cicli?",
                        "expected_answer": "Una risonanza del fegato e una nuova discussione sull'operazione.",
                    },
                    {
                        "question": "Perché riceve anche un anticorpo oltre alla chemioterapia?",
                        "expected_answer": "Perché le analisi del tumore (RAS e BRAF normali) lo rendono efficace.",
                    },
                ],
            },
            "nl": {
                "simple": [
                    {
                        "text": "De tumor komt uit de dikke darm en zit ook op vier plekken in de lever.",
                        "source_id": "imaging",
                    },
                    {
                        "text": "Opereren in de lever kan nu niet: twee plekken liggen te dicht bij een grote ader.",
                        "source_id": "imaging",
                    },
                    {
                        "text": "We starten chemotherapie met een antilichaam om de plekken kleiner te maken.",
                        "source_id": "mdt",
                    },
                    {
                        "text": "Het antilichaam past bij u, omdat de test van de tumor (RAS en BRAF) normaal is.",
                        "source_id": "pathology",
                    },
                    {
                        "text": "Na vier kuren maken we een nieuwe MRI en kijken we of opereren dan wel kan.",
                        "source_id": "mdt",
                        "risk": "'We will see' can be heard as a promise of surgery.",
                    },
                    {
                        "text": "Voor de eerste kuur krijgt u een poortje onder de huid voor het infuus.",
                        "source_id": "mdt",
                    },
                    {"text": "De darm wordt nu niet geopereerd, want die zit niet dicht.", "source_id": "mdt"},
                ],
                "detailed": [
                    {
                        "text": (
                            "Het gaat om een adenocarcinoom van het sigmoïd (cT4a cN2) met vier uitzaaiingen in de "
                            "lever, segment VII en VIII, de grootste 42 mm."
                        ),
                        "source_id": "imaging",
                    },
                    {
                        "text": (
                            "Twee uitzaaiingen liggen tegen de rechter leverader aan; een leveroperatie is nu "
                            "technisch niet mogelijk, maar kan dat worden als ze kleiner worden."
                        ),
                        "source_id": "imaging",
                    },
                    {
                        "text": (
                            "De tumor is RAS- en BRAF-wildtype en zit links in de darm: juist dan voegt het "
                            "anti-EGFR-antilichaam panitumumab iets toe aan de chemotherapie."
                        ),
                        "source_id": "pathology",
                    },
                    {
                        "text": (
                            "Het plan van het multidisciplinair overleg is FOLFOX met panitumumab, elke twee weken "
                            "een infuus, met als doel de uitzaaiingen te verkleinen."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "Na vier kuren volgt een MRI van de lever en bespreken we uw situatie opnieuw in het "
                            "overleg; een operatie is dus nog niet besloten."
                        ),
                        "source_id": "mdt",
                        "risk": "'We will see' can be heard as a promise of surgery.",
                    },
                    {
                        "text": (
                            "Verwachte bijwerkingen: vermoeidheid, tintelingen in handen en voeten bij kou, "
                            "huiduitslag in het gezicht door het antilichaam en een lager aantal witte bloedcellen."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "Voor de eerste kuur wordt een port-a-cath geplaatst; kuur 1 staat gepland op 16 maart "
                            "2026. De darm wordt nu niet geopereerd omdat er geen afsluiting is."
                        ),
                        "source_id": "mdt",
                    },
                ],
                "questions": [
                    {
                        "question": "Waarom wordt de lever niet meteen geopereerd?",
                        "expected_answer": (
                            "De uitzaaiingen liggen te dicht bij een grote ader; ze moeten eerst kleiner."
                        ),
                    },
                    {
                        "question": "Wat gebeurt er na vier kuren?",
                        "expected_answer": "Een MRI van de lever en een nieuw gesprek in het overleg over opereren.",
                    },
                    {
                        "question": "Waarom krijgt u naast chemotherapie ook een antilichaam?",
                        "expected_answer": "Omdat de tumortest (RAS en BRAF normaal) laat zien dat het kan helpen.",
                    },
                ],
            },
            "en": {
                "simple": [
                    {
                        "text": "The tumour started in the bowel and has spread to four spots in the liver.",
                        "source_id": "imaging",
                    },
                    {
                        "text": "We cannot operate on the liver now: two spots sit too close to a large vein.",
                        "source_id": "imaging",
                    },
                    {"text": "We start chemotherapy with an antibody to make the spots smaller.", "source_id": "mdt"},
                    {
                        "text": "The antibody suits you because the tumour test (RAS and BRAF) is normal.",
                        "source_id": "pathology",
                    },
                    {
                        "text": "After four cycles we repeat the MRI and see whether an operation is possible.",
                        "source_id": "mdt",
                        "risk": "'We will see' can be heard as a promise of surgery.",
                    },
                    {
                        "text": "Before the first cycle you get a small port under the skin for the drip.",
                        "source_id": "mdt",
                    },
                    {"text": "Your bowel is not operated on now, because it is not blocked.", "source_id": "mdt"},
                ],
                "detailed": [
                    {
                        "text": (
                            "The diagnosis is adenocarcinoma of the sigmoid colon (cT4a cN2) with four liver "
                            "metastases in segments VII and VIII, the largest 42 mm."
                        ),
                        "source_id": "imaging",
                    },
                    {
                        "text": (
                            "Two lesions abut the right hepatic vein, so liver surgery is not technically possible "
                            "today, but it may become possible if they shrink."
                        ),
                        "source_id": "imaging",
                    },
                    {
                        "text": (
                            "The tumour is RAS and BRAF wild-type and left-sided, which is exactly the setting "
                            "where the anti-EGFR antibody panitumumab adds benefit to chemotherapy."
                        ),
                        "source_id": "pathology",
                    },
                    {
                        "text": (
                            "The tumour board plan is FOLFOX with panitumumab, an infusion every two weeks, aiming "
                            "to shrink the metastases (conversion strategy)."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "After four cycles we repeat the liver MRI and bring your case back to the board to "
                            "consider surgery – that decision has not been taken yet."
                        ),
                        "source_id": "mdt",
                        "risk": "'We will see' can be heard as a promise of surgery.",
                    },
                    {
                        "text": (
                            "Expected side effects: tiredness, tingling in hands and feet in the cold, a rash on "
                            "the face from the antibody, and a lower white blood cell count."
                        ),
                        "source_id": "mdt",
                    },
                    {
                        "text": (
                            "A port-a-cath is placed before cycle 1, which is planned for 16 March 2026. Your "
                            "bowel is not operated on now because there is no obstruction."
                        ),
                        "source_id": "mdt",
                    },
                ],
                "questions": [
                    {
                        "question": "Why is the liver not operated on straight away?",
                        "expected_answer": "The spots are too close to a large vein; they must shrink first.",
                    },
                    {
                        "question": "What happens after four cycles?",
                        "expected_answer": "A liver MRI and a new board discussion about surgery.",
                    },
                    {
                        "question": "Why do you get an antibody as well as chemotherapy?",
                        "expected_answer": "Because the tumour test (RAS and BRAF normal) shows it can help.",
                    },
                ],
            },
        },
    },
}
