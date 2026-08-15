package com.coachhub.analytics.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI analyticsOpenApi() {
        return new OpenAPI()
                .info(
                        new Info()
                                .title("CoachHub Analytics API")
                                .version("v1")
                                .description(
                                        """
                                        Read-only reporting over core-api's live data.

                                        Every endpoint is a SELECT against `core_db`; nothing here \
                                        writes. Percentages are `null` rather than `0` when the \
                                        denominator is zero — a client with no programme assigned \
                                        has not failed to train, and the distinction matters when \
                                        averaging across a roster.

                                        **Not currently reachable from a browser.** The service is \
                                        ClusterIP-only and the ingress routes solely to core-api, \
                                        so the web dashboard needs either an ingress rule plus \
                                        authentication here, or a proxy route through core-api. \
                                        Tenant is taken from the path and is not yet authorised.\
                                        """));
    }
}
