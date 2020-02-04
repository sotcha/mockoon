import { Injectable } from '@angular/core';
import { OpenAPIV2, OpenAPIV3 } from 'openapi-types';
import { RemoveLeadingSlash } from 'src/app/libs/utils.lib';
import { Environment } from 'src/app/types/environment.type';
import {
  methods,
  Route,
  RouteResponse,
  statusCodes,
  Method,
  Header
} from 'src/app/types/route.type';
import * as SwaggerParser from 'swagger-parser';
import { parse as urlParse } from 'url';
import { SchemasBuilderService } from 'src/app/services/schemas-builder.service';

/**
 * WIP
 *
 * TODO:
 * - get response specific headers DONE
 * - get multiple responses DONE
 * - better handling of variable (find in parameter object and really replace) DONE
 * - add route response description in futur label DONE
 * - test/adapt for v3 DONE
 * - export v3
 * - $ref need to be dereferenced ! seems ok
 *
 * - use https://www.npmjs.com/package/json-schema-faker to generate objects from schemaS?
 * - for export use something like for body objects https://www.npmjs.com/package/to-json-schema
 *
 * insomnia example: https://github.com/getinsomnia/insomnia/blob/8a751883f893437c5228eb266f3ec3a58e4a53c8/packages/insomnia-importers/src/importers/swagger2.js#L1-L18
 *
 */

type ParametersTypes = 'PATH_PARAMETERS' | 'SERVER_VARIABLES';
type SpecificationVersions = 'SWAGGER' | 'OPENAPI_V3';

@Injectable({ providedIn: 'root' })
export class OpenAPIConverterService {
  constructor(private schemasBuilderService: SchemasBuilderService) {}

  public async import(filePath: string) {
    try {
      const parsedAPI:
        | OpenAPIV2.Document
        | OpenAPIV3.Document = await SwaggerParser.dereference(filePath);

      if (this.isSwagger(parsedAPI)) {
        return this.convertV2Format(parsedAPI);
      } else if (this.isOpenAPIV3(parsedAPI)) {
        return this.convertV3Format(parsedAPI);
      } else {
        // TODO add error toast
        return;
      }
    } catch (error) {
      console.log(error);
    }
  }

  /**
   * Convert Swagger 2.0 format
   * https://github.com/OAI/OpenAPI-Specification/blob/master/versions/2.0.md
   *
   * @param parsedAPI
   */
  private convertV2Format(parsedAPI: OpenAPIV2.Document): Environment {
    const newEnvironment = this.schemasBuilderService.buildEnvironment(
      false,
      false
    );

    // parse the port
    newEnvironment.port =
      parseInt(parsedAPI.host.split(':')[1], 10) || newEnvironment.port;

    if (parsedAPI.basePath) {
      newEnvironment.endpointPrefix = RemoveLeadingSlash(parsedAPI.basePath);
    }

    newEnvironment.name = parsedAPI.info.title || 'OpenAPI import';

    newEnvironment.routes = this.createRoutes(parsedAPI, 'SWAGGER');

    return newEnvironment;
  }

  /**
   * Convert OpenAPI 3.0 format
   * https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.1.md
   *
   * @param parsedAPI
   */
  private convertV3Format(parsedAPI: OpenAPIV3.Document): Environment {
    const newEnvironment = this.schemasBuilderService.buildEnvironment(
      false,
      false
    );

    // TODO handle variables in server ?
    const server: OpenAPIV3.ServerObject[] = parsedAPI.servers;

    newEnvironment.endpointPrefix =
      server &&
      server[0] &&
      server[0].url &&
      RemoveLeadingSlash(
        urlParse(
          this.parametersReplace(
            server[0].url,
            'SERVER_VARIABLES',
            server[0].variables
          )
        ).path
      );

    newEnvironment.routes = this.createRoutes(parsedAPI, 'OPENAPI_V3');

    return newEnvironment;
  }

  private createRoutes(
    parsedAPI: OpenAPIV2.Document,
    version: 'SWAGGER'
  ): Route[];
  private createRoutes(
    parsedAPI: OpenAPIV3.Document,
    version: 'OPENAPI_V3'
  ): Route[];
  private createRoutes(
    parsedAPI: OpenAPIV2.Document | OpenAPIV3.Document,
    version: SpecificationVersions
  ): Route[] {
    const routes: Route[] = [];

    Object.keys(parsedAPI.paths).forEach(routePath => {
      Object.keys(parsedAPI.paths[routePath]).forEach(routeMethod => {
        const parsedRoute:
          | OpenAPIV2.OperationObject
          | OpenAPIV3.OperationObject = parsedAPI.paths[routePath][routeMethod];

        if (methods.includes(routeMethod)) {
          const routeResponses: RouteResponse[] = [];

          Object.keys(parsedRoute.responses).forEach(responseStatus => {
            // filter unsupported status codes (i.e. ranges containing "X", 4XX, 5XX, etc)
            if (
              statusCodes.find(
                statusCode => statusCode.code.toString() === responseStatus
              )
            ) {
              const routeResponse:
                | OpenAPIV2.ResponseObject
                | OpenAPIV3.ResponseObject =
                parsedRoute.responses[responseStatus];

              let contentTypeHeaders;
              if (version === 'SWAGGER') {
                contentTypeHeaders = (parsedRoute as OpenAPIV2.OperationObject)
                  .produces;
              } else if (version === 'OPENAPI_V3') {
                contentTypeHeaders = (routeResponse as OpenAPIV3.ResponseObject)
                  .content
                  ? Object.keys(
                      (routeResponse as OpenAPIV3.ResponseObject).content
                    )
                  : [];
              }

              routeResponses.push({
                ...this.schemasBuilderService.buildRouteResponse(),
                body: '',
                statusCode: responseStatus.toString(),
                label: routeResponse.description || '',
                headers: this.buildResponseHeaders(
                  contentTypeHeaders,
                  routeResponse.headers
                )
              });
            }
          });

          // check if has at least one response
          if (!routeResponses.length) {
            routeResponses.push({
              ...this.schemasBuilderService.buildRouteResponse(),
              headers: [
                this.schemasBuilderService.buildHeader(
                  'Content-Type',
                  'application/json'
                )
              ]
            });
          }

          const newRoute: Route = {
            ...this.schemasBuilderService.buildRoute(false),
            documentation: parsedRoute.summary || parsedRoute.description || '',
            method: routeMethod as Method,
            endpoint: RemoveLeadingSlash(
              this.parametersReplace(routePath, 'PATH_PARAMETERS')
            ),
            responses: routeResponses
          };

          routes.push(newRoute);
        }
      });
    });

    return routes;
  }

  /**
   * Build route response headers from 'content' (v3) or 'produces' (v2), and 'headers' objects
   *
   * @param contentTypes
   * @param responseHeaders
   */
  private buildResponseHeaders(
    contentTypes: string[],
    responseHeaders:
      | OpenAPIV2.HeadersObject
      | {
          [key: string]: OpenAPIV3.ReferenceObject | OpenAPIV3.HeaderObject;
        }
  ): Header[] {
    const routeContentTypeHeader = this.schemasBuilderService.buildHeader(
      'Content-Type',
      'application/json'
    );

    if (
      contentTypes &&
      contentTypes.length &&
      !contentTypes.includes('application/json')
    ) {
      routeContentTypeHeader.value = contentTypes[0];
    }

    if (responseHeaders) {
      return [
        routeContentTypeHeader,
        ...Object.keys(responseHeaders).map(header =>
          this.schemasBuilderService.buildHeader(header, '')
        )
      ];
    }

    return [routeContentTypeHeader];
  }

  private parametersReplace<T extends ParametersTypes>(
    str: string,
    parametersType: T,
    parameters?: T extends 'PATH_PARAMETERS'
      ? never
      : { [variable in string]: OpenAPIV3.ServerVariableObject }
  ) {
    return str.replace(/{(\w+)}/gi, (searchValue, replaceValue) => {
      if (parametersType === 'PATH_PARAMETERS') {
        return ':' + replaceValue;
      } else if (parametersType === 'SERVER_VARIABLES') {
        return parameters[replaceValue].default;
      }
    });
  }

  /**
   * Swagger specification type guard
   *
   * @param parsedAPI
   */
  private isSwagger(parsedAPI: any): parsedAPI is OpenAPIV2.Document {
    return parsedAPI.swagger !== undefined;
  }

  /**
   * OpenAPI v3 specification type guard
   * @param parsedAPI
   */
  private isOpenAPIV3(parsedAPI: any): parsedAPI is OpenAPIV3.Document {
    return (
      parsedAPI.openapi !== undefined && parsedAPI.openapi.startsWith('3.')
    );
  }
}
