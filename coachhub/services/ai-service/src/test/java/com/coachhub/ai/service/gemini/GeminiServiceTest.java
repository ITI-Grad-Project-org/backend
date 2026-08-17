package com.coachhub.ai.service.gemini;

import com.coachhub.ai.domain.AiDocument;
import com.coachhub.ai.domain.AiRequestRepository;
import com.coachhub.ai.rabbitmq.EventPublisher;
import com.coachhub.ai.rabbitmq.payload.AiRequestedPayload;
import com.coachhub.ai.service.client.GeminiClient;
import com.coachhub.ai.service.rag.RagChunk;
import com.coachhub.ai.service.rag.RagProperties;
import com.coachhub.ai.service.rag.RagService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers the grounding step: that retrieved context actually reaches the model, that the tenant is
 * carried through to retrieval, and that a retrieval failure degrades instead of failing the
 * request.
 */
class GeminiServiceTest {

	private static final RagProperties PROPS =
					new RagProperties(6, 0.62, new RagProperties.Ingest(false, 25, null, null, 0.5));

	private static final AiRequestedPayload PAYLOAD =
					new AiRequestedPayload(
									"req-1", "client-1", "membership-1", "coach-1", "coach@example.com", "advice",
									"How much protein does my client need?");

	private GeminiClient gemini;
	private RagService rag;
	private AiRequestRepository repository;
	private EventPublisher publisher;
	private GeminiService service;

	@BeforeEach
	void setUp() {
		gemini = mock(GeminiClient.class);
		rag = mock(RagService.class);
		repository = mock(AiRequestRepository.class);
		publisher = mock(EventPublisher.class);

		when(repository.findByRequestId(anyString())).thenReturn(Optional.empty());
		when(repository.save(any(AiDocument.class)))
						.thenAnswer(invocation -> invocation.getArgument(0));
		when(gemini.generate(anyString())).thenReturn("Between 1.6 and 2.2 g per kg.");

		service = new GeminiService(gemini, rag, PROPS, repository, publisher);
	}

	private String capturePrompt() {
		ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
		verify(gemini).generate(captor.capture());
		return captor.getValue();
	}

	@Test
	@DisplayName("retrieved context is prepended to the prompt with its sources")
	void groundsThePrompt() {
		when(rag.retrieve(anyString(), anyString(), any(), anyInt()))
						.thenReturn(
										List.of(
														new RagChunk(
																		"Protein for muscle gain is 1.6 to 2.2 g per kg.",
																		"nutrition",
																		0.88)));

		service.process(PAYLOAD, "tenant-a", "corr-1");

		String prompt = capturePrompt();
		assertThat(prompt).contains("=== Context ===");
		assertThat(prompt).contains("(nutrition)");
		assertThat(prompt).contains("1.6 to 2.2 g per kg");
		// The original question must survive intact below the context.
		assertThat(prompt).contains("How much protein does my client need?");
	}

	@Test
	@DisplayName("the envelope's tenant is what scopes retrieval")
	void passesTenantToRetrieval() {
		when(rag.retrieve(anyString(), anyString(), any(), anyInt())).thenReturn(List.of());

		service.process(PAYLOAD, "tenant-a", "corr-1");

		// If this argument ever stops being threaded through, one coach's question
		// starts retrieving another coach's client profiles.
		verify(rag).retrieve(eq(PAYLOAD.prompt()), eq("tenant-a"), eq("membership-1"), eq(6));
	}

	@Test
	@DisplayName("retrieval failure degrades to the raw prompt instead of failing the request")
	void retrievalFailureDegrades() {
		when(rag.retrieve(anyString(), anyString(), any(), anyInt()))
						.thenThrow(new IllegalStateException("atlas unreachable"));

		service.process(PAYLOAD, "tenant-a", "corr-1");

		assertThat(capturePrompt()).isEqualTo(PAYLOAD.prompt());
		// Still a successful answer — a knowledge-base outage must not take the
		// assistant down with it.
		verify(publisher).publish(eq("ai.completed"), any(), eq("tenant-a"), eq("corr-1"));
	}

	@Test
	@DisplayName("no chunks above the threshold means an ungrounded prompt, not an empty context block")
	void emptyRetrievalSendsRawPrompt() {
		when(rag.retrieve(anyString(), anyString(), any(), anyInt())).thenReturn(List.of());

		service.process(PAYLOAD, "tenant-a", "corr-1");

		String prompt = capturePrompt();
		assertThat(prompt).isEqualTo(PAYLOAD.prompt());
		assertThat(prompt).doesNotContain("=== Context ===");
	}
}
