/**
 * The learner profile (settings → General → About you): free text the
 * learner supplied about themselves, injected into every conversation
 * agent's system prompt so goals and examples fit the actual person.
 *
 * Pins the three seams: the settings record (sanitizer/parser/resolution)
 * and the prompt append in baseAgentOptions (all agent kinds ride it).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFauxCore } from "@earendil-works/pi-ai";
import { createTeacherAgent } from "../src/agent/teacher-agent.ts";
import type { PiEngine } from "../src/agent/models.ts";
import {
	LEARNER_PROFILE_MAX_CHARS,
	resolveSettings,
	sanitizeUserSettings,
} from "../src/core/index.ts";
import { parseGeneralSettingsBody } from "../src/server/settings-body.ts";

function fauxEngine(): PiEngine {
	const faux = createFauxCore({});
	return { model: faux.getModel(), streamFn: faux.streamSimple };
}

const PROFILE = "Senior backend engineer. Strong in Java and SQL. Wants to learn distributed systems. Two hours a week.";

describe("learner profile in the settings record", () => {
	it("factory default is an empty profile", () => {
		assert.equal(resolveSettings(null).general.learnerProfile, "");
	});

	it("sanitizer trims, drops empty, caps length, preserves unknown keys", () => {
		const kept = sanitizeUserSettings({ version: 1, general: { learnerProfile: `  ${PROFILE}  ` } })!;
		assert.equal(kept.general?.learnerProfile, PROFILE);
		const empty = sanitizeUserSettings({ version: 1, general: { learnerProfile: "   " } })!;
		assert.equal(empty.general?.learnerProfile, undefined, "blank profile drops (factory default)");
		const capped = sanitizeUserSettings({
			version: 1,
			general: { learnerProfile: "x".repeat(LEARNER_PROFILE_MAX_CHARS + 10) },
		})!;
		assert.equal(capped.general?.learnerProfile?.length, LEARNER_PROFILE_MAX_CHARS);
	});

	it("parser accepts text, rejects wrong types and over-limit pastes", () => {
		const ok = parseGeneralSettingsBody({ autoUpdate: false, learnerProfile: ` ${PROFILE} ` });
		assert.ok(ok.ok);
		assert.deepEqual(ok.settings, { autoUpdate: false, learnerProfile: PROFILE });
		const cleared = parseGeneralSettingsBody({ learnerProfile: "   " });
		assert.ok(cleared.ok);
		assert.equal(cleared.settings.learnerProfile, undefined, "blank clears the profile");
		assert.equal(parseGeneralSettingsBody({ learnerProfile: 1 }).ok, false);
		assert.equal(
			parseGeneralSettingsBody({ learnerProfile: "x".repeat(LEARNER_PROFILE_MAX_CHARS + 1) }).ok,
			false,
		);
	});
});

describe("learner profile in the agent prompt", () => {
	it("appends the profile after the composed prompt for the teacher", () => {
		const agent = createTeacherAgent(undefined, { engine: fauxEngine(), learnerProfile: PROFILE });
		const prompt = agent.state.systemPrompt;
		assert.ok(prompt.includes("## About the learner"));
		assert.ok(prompt.includes(PROFILE));
		assert.ok(prompt.indexOf(PROFILE) > prompt.indexOf("# The agent"), "profile trails the composed doctrine");
	});

	it("no profile means no section (and blank text is ignored)", () => {
		for (const learnerProfile of [undefined, "", "   "]) {
			const agent = createTeacherAgent(undefined, { engine: fauxEngine(), learnerProfile });
			assert.ok(!agent.state.systemPrompt.includes("## About the learner"));
		}
	});
});
