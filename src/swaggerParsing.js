const LOCATION_BODY = 'Body'

function getRequest(service, version) {
    if (version === 2) {
        // Swagger 2.0
        if (service.parameters) {
            const requestParam = service.parameters.find(p => p.in === 'body')
            if (requestParam) {
                return requestParam
            }
        }
    } else if (version === 3) {
        // OpenApi
        if (service.requestBody
            && service.requestBody.content
            && service.requestBody.content['application/json']) {
            return service.requestBody.content['application/json']
        }
    }
    return null
}

function getResponses(service, version) {
    const responses = {}
    if (service.responses) {
        for (const statusCode in service.responses) {
            const response = service.responses[statusCode]
            // Swagger 2.0
            if (version === 2) {
                responses[statusCode] = response
            }
            // OpenApi
            else if (version === 3 && response.content && response.content['application/json']) {
                responses[statusCode] = response.content['application/json']
            }
        }
    }
    return responses
}

function getParameters(service) {
    if (service.parameters) {
        return service.parameters.filter((parameter) => {
            return parameter.in === 'path' || parameter.in === 'query' || parameter.in === 'header'
        })
    } else {
        return []
    }
}

function getAuthorizedValues(model) {
    const rules = []
    if (model.minLength) {
        rules.push(`minLength=${model.minLength}`)
    }
    if (model.maxLength) {
        rules.push(`maxLength=${model.maxLength}`)
    }
    if (model.minItems) {
        rules.push(`minItems=${model.minItems}`)
    }
    if (model.maxItems) {
        rules.push(`maxItems=${model.maxItems}`)
    }
    if (model.minProperties) {
        rules.push(`minProperties=${model.minProperties}`)
    }
    if (model.maxProperties) {
        rules.push(`maxProperties=${model.maxProperties}`)
    }
    if (model.pattern) {
        rules.push(`pattern=${model.pattern}`)
    }
    if (model.format) {
        rules.push(`format=${model.format}`)
    }
    if (model.enum) {
        rules.push(`enum=[${model.enum.join(',')}]`)
    }
    return rules.join('; ')
}

function generateModelFlatMap(model, required = false, path = '#', level = 0) {
    let flatMap = []
    console.log('generateModelFlatMap:', { model })

    const flatItem = {
        Location: LOCATION_BODY,
        Level: level,
        Path: path,
        Type: model.type || 'object',
        Cardinality: required ? 'Required' : 'Optional',
        Authorized: getAuthorizedValues(model),
        Description: model.description || '',
        Example: model.example ? JSON.stringify(module.example) : '',
    }
    flatMap.push(flatItem)

    if (model.type === 'array' && 'items' in model) {
        flatMap = flatMap.concat(
            generateModelFlatMap(
                model.items,
                false,
                path + '[]',
                level + 1
            )
        )
    } else if ('properties' in model) {
        const requiredProperties = model.required || []
        for (const propertyName in model.properties) {
            const property = model.properties[propertyName]
            flatMap = flatMap.concat(
                generateModelFlatMap(
                    property,
                    requiredProperties.indexOf(propertyName) >= 0,
                    path + '/' + propertyName,
                    level + 1
                )
            )
        }
    }
    return flatMap
}

function generateParameterFlatMap(parameter) {
    parameter.in[0] = parameter.in[0].toUpperCase()
    return {
        Location: parameter.in,
        Level: 0,
        Path: parameter.name,
        Type: parameter.type || parameter.schema.type || 'string',
        Cardinality: parameter.required ? 'Required' : 'Optional',
        Authorized: getAuthorizedValues(parameter.schema),
        Description: parameter.description || '',
        Example: parameter.example ? JSON.stringify(module.example) : '',
    }
}

const SwaggerParsing = {
    getApiDocumentationVersion: (api) => {
        if (api.swagger === '2.0') {
            return 2
        }
        else if (api.openapi && api.openapi.startsWith('3')) {
            return 3
        }
        return -1
    },

    extractServices: (api) => {
        const services = []
        for (const path in api.paths) {
            const globalParam = api.paths[path]['parameters'] || []
            for (const method in api.paths[path]) {
                const service = api.paths[path][method]
                service['x-name'] = `${method.toUpperCase()} ${path}`
                service['parameters'] = service['parameters'] || []
                service['parameters'] = service['parameters'].concat(globalParam)
                services.push(service)
            }
        }
        return services
    },

    generateServiceWorkbook(service, version) {
        const workbook = { Request: [] }
        const parameters = getParameters(service)
        console.log('Parameters:', { parameters })
        for (const parameter of parameters) {
            workbook.Request.push(generateParameterFlatMap(parameter))
        }
        const request = getRequest(service, version)
        console.log('Request:', { request })
        if (request && request.schema) {
            workbook.Request = workbook.Request.concat(generateModelFlatMap(request.schema, !!request.required))
        }
        console.log({ workbook })
        const responses = getResponses(service, version)
        for (const statusCode in responses) {
            const response = responses[statusCode]
            if (response && response.schema) {
                workbook[`Response-${statusCode}`] = generateModelFlatMap(response.schema, !!response.required)
            }
        }
        return workbook
    },
}

module.exports = SwaggerParsing
