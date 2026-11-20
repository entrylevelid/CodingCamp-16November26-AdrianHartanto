# Requirements Document

## Introduction

A standalone browser-based personal dashboard delivered as a single HTML page with one CSS file and one JavaScript file. The dashboard helps users organize their day through four integrated widgets: a time/date greeting, a Pomodoro focus timer, a to-do list, and a quick-links launcher. All state is persisted in the browser's LocalStorage — no server or build step is needed. The page must deploy directly to GitHub Pages and work correctly in Chrome, Firefox, Edge, and Safari.

## Glossary

- **Dashboard**: The single HTML page that hosts all widgets.
- **Greeting_Widget**: The section of the Dashboard that displays the current time, date, and a personalized greeting.
- **Timer_Widget**: The Pomodoro countdown timer section of the Dashboard.
- **Todo_Widget**: The to-do list section of the Dashboard.
- **Links_Widget**: The quick-links launcher section of the Dashboard.
- **Task**: A single to-do item composed of a text description and a completion state.
- **Link**: A user-defined record composed of a display label and a URL.
- **Session_Duration**: The configurable countdown length used by the Timer_Widget, measured in whole minutes.
- **LocalStorage**: The browser's `window.localStorage` API used for all client-side persistence.
- **Theme**: The active color scheme of the Dashboard, either `light` or `dark`.
- **User_Name**: The personalized name the user sets for use in the greeting.

---

## Requirements

### Requirement 1: Time, Date, and Greeting Display

**User Story:** As a user, I want to see the current time, date, and a personalized greeting so that the Dashboard orients me at a glance.

#### Acceptance Criteria

1. THE Greeting_Widget SHALL display the current local time in HH:MM (24-hour) format, refreshing at every new wall-clock minute.
2. THE Greeting_Widget SHALL display the current local date as full weekday name, full month name, and day number (e.g., "Monday, January 6"), without a year.
3. IF the local hour is between 05 and 11 inclusive, THEN THE Greeting_Widget SHALL display the greeting prefix "Good morning".
4. IF the local hour is between 12 and 17 inclusive, THEN THE Greeting_Widget SHALL display the greeting prefix "Good afternoon".
5. IF the local hour is between 18 and 20 inclusive, THEN THE Greeting_Widget SHALL display the greeting prefix "Good evening".
6. IF the local hour is 21 or greater, or 04 or less, THEN THE Greeting_Widget SHALL display the greeting prefix "Good night".
7. WHEN a User_Name of 1 to 50 characters is stored in LocalStorage, THE Greeting_Widget SHALL display the greeting as the prefix followed by a comma, a space, and the User_Name (e.g., "Good morning, Adrian").
8. WHEN no User_Name is stored in LocalStorage, THE Greeting_Widget SHALL display the greeting prefix without a name suffix.

---

### Requirement 2: Custom Name Setting

**User Story:** As a user, I want to set and change my name so that the greeting feels personal.

#### Acceptance Criteria

1. THE Dashboard SHALL provide an input control that allows the user to enter a User_Name of 1 to 50 characters.
2. WHEN the user submits a non-empty User_Name, THE Dashboard SHALL save the User_Name to LocalStorage.
3. WHEN the user submits a non-empty User_Name, THE Greeting_Widget SHALL update the displayed greeting to include the new User_Name within 500 milliseconds without a page reload.
4. WHEN the user clears the User_Name input and submits, THE Dashboard SHALL remove the User_Name from LocalStorage.
5. WHEN the User_Name is absent from LocalStorage, THE Greeting_Widget SHALL display the greeting prefix with no name appended.
6. THE Dashboard SHALL load the stored User_Name from LocalStorage on page load and pre-populate the name input with that value.
7. IF the submitted User_Name consists entirely of whitespace characters, THEN THE Dashboard SHALL treat it as an empty submission and remove the User_Name from LocalStorage.

---

### Requirement 3: Focus Timer (Pomodoro)

**User Story:** As a user, I want a countdown timer so that I can work in focused sessions without losing track of time.

#### Acceptance Criteria

1. THE Timer_Widget SHALL display a countdown in MM:SS format.
2. THE Timer_Widget SHALL initialize the countdown to the Session_Duration on page load.
3. WHEN the user activates the Start control, THE Timer_Widget SHALL begin decrementing the countdown by one second per second.
4. WHEN the user activates the Stop control while the timer is running, THE Timer_Widget SHALL pause the countdown at its current value.
5. WHEN the user activates the Reset control, THE Timer_Widget SHALL stop any running countdown and restore the display to the full Session_Duration.
6. WHEN the countdown reaches 00:00, THE Timer_Widget SHALL stop automatically and play an audible alert lasting between 1 and 3 seconds.
7. WHILE the timer is running, THE Timer_Widget SHALL disable the Start control and enable the Stop control.
8. WHILE the timer is paused, THE Timer_Widget SHALL enable the Start control and disable the Stop control.
9. WHILE the timer is in the reset state, THE Timer_Widget SHALL enable the Start control and disable the Stop control.
10. THE Timer_Widget SHALL provide a Session_Duration input accepting whole-number values between 1 and 99 minutes inclusive.
11. WHEN the user changes the Session_Duration, THE Timer_Widget SHALL save the new value to LocalStorage.
12. IF the timer is not running when the user changes the Session_Duration, THEN THE Timer_Widget SHALL immediately reset the display to the new Session_Duration.
13. IF the timer is running when the user changes the Session_Duration, THEN THE Timer_Widget SHALL ignore the new value until the user activates the Reset control, at which point the display SHALL restore to the new Session_Duration.
14. THE Dashboard SHALL load the stored Session_Duration from LocalStorage on page load, defaulting to 25 minutes if no value is stored.

---

### Requirement 4: To-Do List

**User Story:** As a user, I want to add, complete, edit, and delete tasks so that I can track what I need to do today.

#### Acceptance Criteria

1. THE Todo_Widget SHALL provide a text input accepting up to 500 characters and an Add control for creating new Tasks.
2. WHEN the user submits a non-empty task description of up to 500 characters, THE Todo_Widget SHALL add a new Task with completion state set to incomplete and display it in the task list.
3. IF the user submits an empty task description, THEN THE Todo_Widget SHALL not add a Task and SHALL display an inline validation message.
4. WHEN the user activates the complete toggle on a Task, THE Todo_Widget SHALL update the Task's completion state to the opposite of its current state and persist the change to LocalStorage.
5. WHEN the user activates the delete control on a Task, THE Todo_Widget SHALL remove the Task from the list and from LocalStorage.
6. WHEN the user activates the edit control on a Task, THE Todo_Widget SHALL replace the Task display with an inline text input pre-populated with the current task description and accepting up to 500 characters.
7. WHEN the user submits a non-empty edited task description of up to 500 characters, THE Todo_Widget SHALL update the Task's description in the list and in LocalStorage and return the Task to display mode.
8. IF the user submits an empty edited task description, THEN THE Todo_Widget SHALL not save the edit and SHALL display an inline validation message.
9. WHEN the user activates the cancel control during edit mode, THE Todo_Widget SHALL discard the edited input, restore the original task description, and return the Task to display mode.
10. THE Todo_Widget SHALL visually distinguish completed Tasks from incomplete Tasks using a strikethrough style on the task description text.
11. WHEN the Dashboard page loads, THE Dashboard SHALL read all stored Tasks from LocalStorage and render them in the order they were originally inserted.
12. WHEN a Task is added, edited, or deleted, THE Todo_Widget SHALL save the complete updated task list to LocalStorage.

---

### Requirement 5: Quick Links

**User Story:** As a user, I want to save and launch favorite website links so that I can reach them without typing URLs.

#### Acceptance Criteria

1. THE Links_Widget SHALL provide a label input, a URL input, and an Add control for creating new Links.
2. WHEN the user submits a Link with a non-empty label and a non-empty URL that begins with `http://` or `https://`, THE Links_Widget SHALL add the Link to the list, display it as a clickable button showing the entered label and the final stored URL, and persist it to LocalStorage.
3. IF the user submits a Link with an empty label, an empty URL, or both fields empty, THEN THE Links_Widget SHALL not add the Link and SHALL display a separate inline validation message for each field that is empty.
4. IF the user submits a URL that does not begin with `http://` or `https://`, THEN THE Links_Widget SHALL prepend `https://` to the URL before saving and SHALL display the corrected URL on the resulting Link button.
5. WHEN the user activates a Link button, THE Links_Widget SHALL open the associated stored URL in a new browser tab.
6. WHEN the user activates the delete control on a Link, THE Links_Widget SHALL remove the Link from the list and from LocalStorage.
7. THE Dashboard SHALL load all stored Links from LocalStorage on page load and render them in the order they were originally added, with the earliest-added Link appearing first.

---

### Requirement 6: Light / Dark Mode Toggle

**User Story:** As a user, I want to switch between light and dark color schemes so that I can use the Dashboard comfortably in any lighting condition.

#### Acceptance Criteria

1. THE Dashboard SHALL render the Theme toggle control in a fixed position that remains visible in the viewport regardless of scroll position.
2. WHEN the user activates the Theme toggle, THE Dashboard SHALL switch the active Theme between `light` and `dark` and apply the new color scheme to all widgets within 100 milliseconds.
3. WHEN the user activates the Theme toggle, THE Dashboard SHALL save the new Theme value to LocalStorage.
4. WHEN the page loads, THE Dashboard SHALL read the stored Theme value from LocalStorage and apply the corresponding color scheme before any widget content is rendered.
5. IF no Theme is stored in LocalStorage, THEN THE Dashboard SHALL apply the `light` Theme by default.

---

### Requirement 7: Cross-Browser Compatibility and Performance

**User Story:** As a user, I want the Dashboard to load instantly and work in my browser so that I am never blocked by compatibility issues.

#### Acceptance Criteria

1. THE Dashboard SHALL load and render all widgets within 2 seconds, measured from navigation start to the point at which all widget content is visible in the viewport, on a connection with a minimum download speed of 25 Mbps.
2. THE Dashboard SHALL pass all acceptance criteria defined in Requirements 1 through 6 when tested in the latest stable releases of Chrome, Firefox, Edge, and Safari using only HTML, CSS, and Vanilla JavaScript — no external libraries or frameworks.
3. THE Dashboard SHALL use only the LocalStorage API for data persistence and SHALL NOT make any network requests after the initial page load.
4. THE Dashboard SHALL adapt its layout to viewport widths between 320px and 2560px without horizontal scrolling or overlapping content.
5. THE Dashboard SHALL be contained in exactly one HTML file, one CSS file located in a `css/` directory, and one JavaScript file located in a `js/` directory.
