"use strict";
// Built-in Markdown templates; available offline and from file://.
const DOCUMENT_TEMPLATES = [
  {
    "id": "resume",
    "name": "Resume",
    "description": "A professional profile with a top-right photo, experience, education, and skills.",
    "text": "::: row\n::: col [3]\n# Your Name\n**Job title / Professional specialty**\n\nEmail: name@example.com · Phone: +00 000 000 0000  \nLocation: City, Country · Portfolio: https://example.com\n:::\n\n::: col [1]\n::: absolute [top-right]\n![Profile photo — replace with your own](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACgCAIAAABL8POqAAAB10lEQVR42u3cwW1CQRBEwQ7XsTgBp8jRzoAULPiiZ/+UNAnwSnBgdzaP3z9TnEgAAIABAMAAAGAAADAAABgAAAwAAAYAAAMAgAEAwAAAYAAAMAAATJqv7x8An2v9/wFQS38WQ+6a/hSG3Dv9fIZsSD+ZIavqDzTItvrTDLKw/iiD7Kw/xyBr6w8xALAeoFh/ggGA3QD1+nUDAIsBhtTvGgDYCjCqftEAAAAAAAAAAAAAwOr6LQPfAD9BAAAAAAAAAAAAzgOcBwBwJuxMGIB7Qe4FAXA31N1QAPYD7AfYkLEjZkfMlqQ9YXvCNuW9FeGtCK+lrAV4geGUD+XFLAC7BwAAAAYAAAMAgAEAwAAAYAAAMAD8HX2PU0kAgy5GAHAxy91Qd0PtB1jSW7+k57maGsDY9C2GqN81iPRdhqjfNYj6XYOo3zWI+l2DqN81iPpdg6jfNYj6XYOo3zWI+l0DALcAWFj/KoOo3zUAcDjA8vrvGwA4GUD69w0AHAsg+iUGAM4EkPsqAwAAAKhfNAAAAACAkwAkvtYAAAAAAAAAAAAAAAAAANT/sIFvgJ8gAAAAAAAAAAAAAAAATAdg4FAegNAAVgMwcDkXgNxdAAZWlNYDMLCmegeAJ7XCLifjetIMAAAAAElFTkSuQmCC)\n:::\n:::\n:::\n\n## Profile\nWrite two or three sentences about your experience, strengths, and the role you are seeking.\n\n::: row\n::: col [2]\n## Experience\n### Job Title — Company Name\n*Month Year – Present · City*\n\n- Describe a result you achieved, including a measurable outcome.\n- Explain a project you owned and how it helped the team.\n- Highlight a responsibility relevant to your next role.\n\n### Previous Job Title — Company Name\n*Month Year – Month Year*\n\n- Summarize a key contribution and its impact.\n\n## Projects\n**Project name** — Describe the problem, your contribution, and the outcome.\n:::\n\n::: col [1]\n## Education\n**Degree / Qualification — Institution**  \nGraduation year · Relevant coursework or honors\n\n## Skills\n- **Technical:** Tools, technologies, or methods\n- **Professional:** Communication, planning, leadership\n- **Languages:** Language and proficiency\n:::\n:::\n",
    "layout": {}
  },
  {
    "id": "invoice",
    "name": "Invoice",
    "description": "Itemized services, totals, payment details, and due date.",
    "text": "# INVOICE\n**Invoice number:** INV-001  \n**Issued:** [Date]  \n**Due:** [Date]  \n**Currency:** [Currency code]\n\n::: row\n::: col\n## From\n**Your Business Name**  \nStreet address, City, Postal code  \nEmail: billing@example.com · Phone: [Phone]\n:::\n\n::: col\n## Bill to\n**Client / Company Name**  \nBilling address  \nContact email\n:::\n:::\n\n| Description | Quantity | Unit price | Amount |\n| --- | ---: | ---: | ---: |\n| Design services | 8 | 50.00 | 400.00 |\n| Project setup | 1 | 100.00 | 100.00 |\n\n| Summary | Amount |\n| --- | ---: |\n| Subtotal | 500.00 |\n| Tax (0% — replace as applicable) | 0.00 |\n| **Total due** | **500.00** |\n\n## Payment details\n**Method:** Bank transfer  \n**Bank / Account:** [Payment details]  \n**Reference:** INV-001\n\n## Notes\nThank you for your business. Please include the invoice number with your payment.\n\n*Sample amounts only. Update quantities, totals, currency, and tax details before sending. Totals are entered manually.*\n",
    "layout": {}
  },
  {
    "id": "meeting-agenda",
    "name": "Meeting agenda",
    "description": "A timed agenda with goals, preparation, decisions, and action owners.",
    "text": "# Meeting Agenda\n**Meeting:** [Project / Team name]  \n**Date and time:** [Date, start – end, time zone]  \n**Location / Call link:** [Location or URL]  \n**Facilitator:** [Name] · **Notes:** [Name]\n\n## Objective\nState the decision or outcome this meeting should achieve.\n\n::: row\n::: col\n## Attendees\n- [Name — Role]\n- [Name — Role]\n:::\n\n::: col\n## Preparation\n- [ ] Read the project update.\n- [ ] Bring questions and proposed solutions.\n:::\n:::\n\n## Agenda\n| Time | Topic | Lead | Desired outcome |\n| --- | --- | --- | --- |\n| 09:00–09:05 | Welcome and goals | Facilitator | Agree on priorities |\n| 09:05–09:20 | Progress review | Project lead | Identify blockers |\n| 09:20–09:40 | Discussion and decisions | Team | Choose next steps |\n| 09:40–09:45 | Actions and recap | Facilitator | Confirm owners |\n\n## Decisions\n- [Decision and reasoning]\n\n## Action items\n| Action | Owner | Due date | Status |\n| --- | --- | --- | --- |\n| [Task] | [Name] | [Date] | Open |\n\n## Next meeting\n[Date, time, and proposed focus]\n",
    "layout": {}
  },
  {
    "id": "project-proposal",
    "name": "Project proposal",
    "description": "Define the problem, deliverables, milestones, budget, and approval.",
    "text": "# Project Proposal\n**Project:** [Project name]  \n**Prepared for:** [Client / Sponsor]  \n**Prepared by:** [Name / Team]  \n**Date:** [Date] · **Version:** 1.0\n\n## Executive summary\nDescribe the opportunity, the proposed solution, and the expected benefit.\n\n## Problem and objectives\nExplain the current challenge and how success will be measured.\n\n- **Objective 1:** [Measurable result]\n- **Objective 2:** [Measurable result]\n\n## Scope and deliverables\n| Deliverable | Description | Acceptance criteria |\n| --- | --- | --- |\n| Discovery report | Requirements and research | Sponsor approves findings |\n| Initial solution | Working draft or prototype | Agreed features demonstrated |\n| Final delivery | Completed solution and handover | Acceptance checklist signed |\n\n**Out of scope:** [Excluded work]\n\n## Approach and timeline\n| Phase | Duration | Milestone |\n| --- | --- | --- |\n| Discovery | Week 1 | Requirements agreed |\n| Design and implementation | Weeks 2–4 | Draft delivered |\n| Review and handover | Week 5 | Final approval |\n\n## Budget\n| Item | Estimated cost |\n| --- | ---: |\n| Discovery | 500.00 |\n| Implementation | 2,000.00 |\n| Review and handover | 500.00 |\n| **Total estimate** | **3,000.00** |\n\n*Replace example amounts and specify currency, tax, and payment terms.*\n\n::: row\n::: col\n## Risks and assumptions\n- **Risk:** [Potential issue] — **Mitigation:** [Response]\n- **Assumption:** [Dependency or available resource]\n:::\n\n::: col\n## Approval\n**Sponsor:** ____________________  \n**Signature:** ____________________  \n**Date:** ____________________\n:::\n:::\n",
    "layout": {}
  },
  {
    "id": "daily-schedule",
    "name": "Daily schedule",
    "description": "Plan time blocks, priorities, breaks, and a daily reflection.",
    "text": "# Daily Schedule\n**Date:** [Day, Date]  \n**Focus for today:** [One main goal]\n\n::: row\n::: col\n## Top priorities\n- [ ] Priority 1\n- [ ] Priority 2\n- [ ] Priority 3\n:::\n\n::: col\n## Reminders\n- [ ] [Appointment / Errand]\n- [ ] [Personal reminder]\n:::\n:::\n\n## Time blocks\n| Time | Activity | Notes |\n| --- | --- | --- |\n| 07:00–08:00 | Morning routine | Breakfast and preparation |\n| 08:00–08:30 | Plan the day | Review priorities |\n| 08:30–10:30 | Focus work | Most important task |\n| 10:30–10:45 | Break | Stretch and recharge |\n| 10:45–12:00 | Project work | Continue key deliverable |\n| 12:00–13:00 | Lunch | Step away from work |\n| 13:00–14:30 | Meetings / Collaboration | Prepare questions |\n| 14:30–14:45 | Break | Short walk |\n| 14:45–16:30 | Focus work | Complete remaining tasks |\n| 16:30–17:00 | Review and wrap-up | Plan tomorrow |\n\n## End-of-day reflection\n**Completed:** [What went well?]  \n**Carry forward:** [What needs more time?]  \n**Tomorrow's first step:** [Next action]\n",
    "layout": {}
  },
  {
    "id": "lesson-plan",
    "name": "Lesson plan",
    "description": "Learning objectives, teaching activities, assessment, and differentiation.",
    "text": "# Lesson Plan\n**Subject:** [Subject]  \n**Topic:** [Lesson topic]  \n**Grade / Age group:** [Level]  \n**Teacher:** [Name] · **Date:** [Date]  \n**Duration:** 60 minutes\n\n::: row\n::: col\n## Learning objectives\nBy the end of the lesson, students will be able to:\n\n1. Explain [key concept] in their own words.\n2. Apply [skill] to a practical example.\n3. Demonstrate understanding through [assessment].\n:::\n\n::: col\n## Materials and preparation\n- [Textbook / Reading]\n- [Slides / Worksheet / Equipment]\n- [ ] Prepare examples and check equipment.\n:::\n:::\n\n## Lesson sequence\n| Time | Activity | Teacher actions | Student actions |\n| --- | --- | --- | --- |\n| 0–5 min | Starter | Ask an opening question | Recall prior knowledge |\n| 5–20 min | Explain and model | Introduce concept and example | Listen, ask, and take notes |\n| 20–40 min | Guided practice | Support groups and give feedback | Work on practice task |\n| 40–55 min | Independent practice | Observe and assess | Apply the skill independently |\n| 55–60 min | Review / Exit ticket | Summarize and check understanding | Share one learning and one question |\n\n## Differentiation\n- **Additional support:** [Scaffolds, visuals, or guided steps]\n- **Extension:** [Challenge task or deeper application]\n- **Accessibility:** [Adjustments for learner needs]\n\n## Assessment\n**Evidence of learning:** [Student work / Observation / Quiz]  \n**Success criteria:** [What a successful response includes]\n\n## Homework / Follow-up\n[Task and due date]\n\n## Teacher reflection\n[What worked? What should change next time?]\n",
    "layout": {}
  },
  {
    "id": "student-certificate",
    "name": "Student certificate",
    "description": "A landscape certificate with recipient, achievement, and signature fields.",
    "text": "# Certificate of Achievement\n### [School / Institution]\n\nThis certificate is proudly presented to\n\n## [Student Name]\n\nFor dedication, effort, and successful completion of **[Course / Achievement]**.\n\n**Awarded on [Date]**\n\n::: row\n::: col\n**Teacher / Instructor**\n\n____________________\n\n[Name and title]\n:::\n\n::: col\n**Principal / Director**\n\n____________________\n\n[Name and title]\n:::\n:::\n\n**Certificate number:** [CERT-001]\n",
    "layout": {
      "orientation": "landscape",
      "margin": "narrow",
      "header": "",
      "footer": "",
      "pageNumbers": false
    }
  },
  {
    "id": "wedding-invitation",
    "name": "Wedding invitation",
    "description": "A classic invitation with ceremony, reception, and RSVP details.",
    "text": "# Together with their families\n\n# [Partner One]\n\n### &\n\n# [Partner Two]\n\nJoyfully invite you to celebrate their wedding\n\n---\n\n## [Day of Week], [Date]\n\n### Ceremony at [Time]\n\n**[Venue Name]**  \n[Street address]  \n[City, Country]\n\n## Reception to follow\n\n[Reception venue and time]\n\n---\n\n**Dress code:** [Dress code]  \n**Please RSVP by [Date]**  \n[Contact name] · [Phone / Email]  \n[Wedding website URL]\n\n*We look forward to celebrating with you.*\n",
    "layout": {
      "header": "",
      "footer": "",
      "pageNumbers": false
    }
  },
  {
    "id": "itinerary",
    "name": "Travel itinerary",
    "description": "A trip overview with bookings, daily activities, and packing reminders.",
    "text": "# Travel Itinerary\n**Trip:** [Destination / Trip name]  \n**Travelers:** [Names]  \n**Dates:** [Start date – End date]  \n**Time zone:** [Local time zone]\n\n## Travel overview\n| Detail | Information |\n| --- | --- |\n| Outbound travel | [Date, flight / train number, departure – arrival] |\n| Return travel | [Date, flight / train number, departure – arrival] |\n| Accommodation | [Name, address, check-in / check-out] |\n| Booking references | [Transport and hotel references] |\n\n## Day 1 — Arrival and exploring\n| Time | Plan | Location / Notes |\n| --- | --- | --- |\n| 10:00 | Arrive and transfer | [Airport / Station to hotel] |\n| 12:00 | Lunch | [Restaurant / Area] |\n| 14:00 | Check in | [Hotel] |\n| 16:00 | Explore the neighborhood | [Places to visit] |\n| 19:00 | Dinner | [Reservation details] |\n\n## Day 2 — Main activities\n| Time | Plan | Location / Notes |\n| --- | --- | --- |\n| 08:00 | Breakfast | [Location] |\n| 09:00 | Main attraction | [Tickets / Booking time] |\n| 12:30 | Lunch | [Location] |\n| 14:00 | Afternoon activity | [Transport and duration] |\n| 18:30 | Dinner and free time | [Location] |\n\n## Day 3 — Departure\n- [ ] Pack and check out by [Time].\n- [ ] Transfer to airport / station at [Time].\n- [ ] Depart at [Time].\n\n::: row\n::: col\n## Useful contacts\n**Accommodation:** [Phone]  \n**Travel organizer / Local contact:** [Name and phone]\n:::\n\n::: col\n## Packing and reminders\n- [ ] Travel documents and tickets\n- [ ] Chargers and adapters\n- [ ] Clothing for the weather\n- [ ] Personal essentials\n- [ ] Offline copies of bookings and maps\n:::\n:::\n",
    "layout": {}
  }
];

let selectedDocumentTemplate = null;
function selectDocumentTemplate(id) {
  const template = DOCUMENT_TEMPLATES.find(item => item.id === id);
  if (!template) return;
  selectedDocumentTemplate = template;
  for (const button of document.querySelectorAll('[data-template-id]')) {
    button.setAttribute('aria-pressed', String(button.dataset.templateId === id));
  }
  $('#templatePreviewTitle').textContent = template.name;
  const preview = document.createElement('div');
  preview.innerHTML = renderMarkdown(template.text).html;
  preview.querySelectorAll('.table-editor-caption').forEach(element => element.remove());
  $('#templatePreview').replaceChildren(...preview.childNodes);
}
function openDocumentTemplates() {
  if (!ready || libraryBusy) return;
  selectDocumentTemplate(selectedDocumentTemplate?.id || DOCUMENT_TEMPLATES[0].id);
  $('#templateError').textContent = '';
  $('#templateDialog').showModal();
}
async function createDocumentFromTemplate() {
  if (!ready || libraryBusy || !selectedDocumentTemplate) return;
  libraryBusy = true;
  $('#templateCreate').disabled = true;
  $('#templateError').textContent = '';
  try {
    if (!await flushDocument()) {
      $('#templateError').textContent = 'Could not save the current document. Please try again.';
      return;
    }
    const template = selectedDocumentTemplate;
    const record = newRecord(template.name, template.text, { ...DEFAULT_LAYOUT, ...template.layout });
    await storeRecord(record);
    displayDocument(record);
    closeLibrary();
    $('#templateDialog').close();
    editor.focus();
    toast(`Created ${template.name}`);
  } catch (error) {
    console.error('Template creation failed:', error);
    $('#templateError').textContent = 'Could not create the document. Browser storage may be full.';
  } finally {
    libraryBusy = false;
    $('#templateCreate').disabled = false;
  }
}
function initializeDocumentTemplates() {
  for (const template of DOCUMENT_TEMPLATES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'template-card';
    button.dataset.templateId = template.id;
    button.setAttribute('aria-pressed', 'false');
    const title = document.createElement('strong'); title.textContent = template.name;
    const description = document.createElement('span'); description.textContent = template.description;
    button.append(title, description);
    button.addEventListener('click', () => selectDocumentTemplate(template.id));
    $('#templateList').append(button);
  }
  $('#templatesTop').addEventListener('click', openDocumentTemplates);
  $('#libraryTemplates').addEventListener('click', openDocumentTemplates);
  $('#templateClose').addEventListener('click', () => $('#templateDialog').close());
  $('#templateCancel').addEventListener('click', () => $('#templateDialog').close());
  $('#templateCreate').addEventListener('click', createDocumentFromTemplate);
}
