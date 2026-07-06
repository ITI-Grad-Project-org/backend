package com.coachhub.ai.service.client;

import java.util.List;

public class GeminiDtos {
	private GeminiDtos() {}

	public record GeminiRequest(List<Content> contents) {
		public static GeminiRequest of(String prompt) {
			return new GeminiRequest(List.of(new Content(List.of(new Part(prompt)))));
		}

		public record Content(List<Part> parts) {}

		public record Part(String text) {}
	}

	public record GeminiResponse(List<Candidate> candidates) {
		public record Candidate(Content content) {}

		public record Content(List<Part> parts) {}

		public record Part(String text) {}
	}
}
