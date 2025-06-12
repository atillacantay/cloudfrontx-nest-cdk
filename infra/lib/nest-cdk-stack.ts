import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as path from 'path';
import { Construct } from 'constructs';

export class NestCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'NestAppVpc', {
      maxAzs: 2,
    });

    const rdsSecurityGroup = new ec2.SecurityGroup(this, 'RDSSecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });

    rdsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'Allow PostgreSQL access',
    );

    const databaseInstance = new rds.DatabaseInstance(this, 'PostgresDB', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_14,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO,
      ),
      vpc,
      securityGroups: [rdsSecurityGroup],
      credentials: rds.Credentials.fromGeneratedSecret('postgres'),
      multiAz: false,
      allocatedStorage: 20,
      databaseName: 'nestdb',
      publiclyAccessible: false,
    });

    new cdk.CfnOutput(this, 'DatabaseSecret', {
      value: databaseInstance.secret?.secretArn || 'No Secrets Generated',
    });

    const lambdaFunction = new lambdaNodejs.NodejsFunction(this, 'NestLambda', {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '../../dist/src/main.js'),
      timeout: cdk.Duration.seconds(30),
      handler: 'handler',
      bundling: {
        externalModules: [
          'aws-sdk',
          '@nestjs/microservices',
          'class-transformer',
          '@nestjs/websockets/socket-module',
          'cache-manager',
          'class-validator',
        ],
      },
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [rdsSecurityGroup],
      environment: {
        DB_HOST: databaseInstance.dbInstanceEndpointAddress,
        DB_NAME: 'nestdb',
        DB_PORT: '5432',
        DB_USER: 'postgres',
        DB_PASSWORD:
          databaseInstance.secret
            ?.secretValueFromJson('password')
            ?.unsafeUnwrap()
            ?.toString() || '',
      },
    });

    if (databaseInstance.secret) {
      databaseInstance.secret.grantRead(lambdaFunction);
    }
    databaseInstance.connections.allowDefaultPortFrom(lambdaFunction);

    const api = new apigateway.RestApi(this, 'NestApi', {
      restApiName: 'Nest Application API',
      description: 'REST API for the Nest.js shopping cart application.',
      defaultCorsPreflightOptions: {
        allowOrigins: ['*'],
        allowMethods: [lambda.HttpMethod.ALL],
        allowHeaders: ['*'],
      },
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction);

    // Handle root path
    api.root.addMethod('ANY', lambdaIntegration);

    // Add proxy resource to handle all sub-paths
    const proxyResource = api.root.addResource('{proxy+}');
    proxyResource.addMethod('ANY', lambdaIntegration);

    new cdk.CfnOutput(this, 'NestApiEndpoint', {
      value: api.url,
      description: 'Nest API Gateway endpoint URL',
    });
  }
}
