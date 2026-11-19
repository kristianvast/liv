import type { Messages } from "../../core";

export const access = {
  lead: "Liv needs this to get your request done. It only asks once.",
  leadSettings: "Before you turn this on, here is what it lets Liv do.",
  "shell.title": "Let Liv run commands?",
  "shell.what":
    "Liv runs commands and small programs on this computer to build and fix things for your farm, like checking that a tool is installed.",
  "shell.care":
    "It says what each command is for and checks with you before anything big, like deleting files or installing software.",
  "browser.title": "Let Liv use a web browser?",
  "browser.what":
    "Liv opens web pages in its own browser to look things up, fill in forms and sign in where you ask it to.",
  "browser.care":
    "Sign-ins stay on this computer, and Liv never saves your passwords in its memory.",
  "computer.title": "Let Liv use your screen, mouse and keyboard?",
  "computer.what":
    "Liv can look at your screen and operate another program, like a herd or milking program, when there is no other way in.",
  "computer.care":
    "It only does this for the job you asked for, and you can stop it any time from the chat.",
  risk: "Liv is free, open-source software, provided as is. Liv is helpful but can make mistakes, so by allowing this you accept the risk of what it does on this computer. You can turn it off any time in Settings.",
  allow: "Allow",
  decline: "Not now",
} satisfies Messages;
