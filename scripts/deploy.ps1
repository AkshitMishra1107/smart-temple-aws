param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Profile,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9]{12}$')]
    [string]$AccountId,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$')]
    [string]$AuthDomainPrefix,

    [string]$StackName = 'smart-temple',
    [string]$Region = 'ap-south-1',
    [switch]$UseCloudFront
)

$ErrorActionPreference = 'Stop'
$frontendConfigNames = @(
    'VITE_API_BASE_URL',
    'VITE_AUTH_DOMAIN',
    'VITE_USER_POOL_ID',
    'VITE_USER_POOL_CLIENT_ID',
    'VITE_AUTH_CALLBACK_URL',
    'VITE_AUTH_LOGOUT_URL',
    'VITE_SITE_BASE_PATH'
)
$previousFrontendConfig = @{}
foreach ($name in $frontendConfigNames) {
    $previousFrontendConfig[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

foreach ($program in @('aws', 'npm')) {
    if (-not (Get-Command $program -ErrorAction SilentlyContinue)) {
        throw "Required program '$program' was not found in PATH. See docs/deployment.md."
    }
}

Push-Location (Join-Path $PSScriptRoot '..')
try {
    $identityJson = & aws sts get-caller-identity --profile $Profile --region $Region --output json
    if ($LASTEXITCODE -ne 0) {
        throw "AWS identity check failed for profile '$Profile'. Fix its login before deployment."
    }
    $identity = $identityJson | ConvertFrom-Json

    Write-Host "Selected AWS account: $($identity.Account)"
    Write-Host "Selected identity: $($identity.Arn)"
    if ($AccountId -ne $identity.Account) {
        throw "Profile '$Profile' does not match expected AWS account '$AccountId'."
    }

    $artifactBucket = "smart-temple-artifacts-$AccountId-$Region"
    $bucketOutput = & aws s3api list-buckets --prefix $artifactBucket --query 'Buckets[].Name' --output json --profile $Profile --region $Region
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not check for the deployment artifact bucket.'
    }
    if ($artifactBucket -notin ($bucketOutput | ConvertFrom-Json)) {
        $createArgs = @('s3api', 'create-bucket', '--bucket', $artifactBucket, '--profile', $Profile, '--region', $Region)
        if ($Region -ne 'us-east-1') {
            $createArgs += @('--create-bucket-configuration', "LocationConstraint=$Region")
        }
        & aws @createArgs
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the deployment artifact bucket.' }
    }
    & aws s3api head-bucket --bucket $artifactBucket --expected-bucket-owner $AccountId --profile $Profile --region $Region
    if ($LASTEXITCODE -ne 0) { throw 'Could not verify the deployment artifact bucket.' }

    New-Item -ItemType Directory -Path '.aws-sam' -Force | Out-Null
    & aws cloudformation package --template-file template.yaml --s3-bucket $artifactBucket --s3-prefix $StackName --output-template-file .aws-sam/packaged.yaml --profile $Profile --region $Region
    if ($LASTEXITCODE -ne 0) {
        throw 'CloudFormation packaging failed.'
    }

    & aws cloudformation deploy `
        --template-file .aws-sam/packaged.yaml `
        --stack-name $StackName `
        --region $Region `
        --profile $Profile `
        --no-fail-on-empty-changeset `
        --capabilities CAPABILITY_IAM `
        --parameter-overrides "AuthDomainPrefix=$AuthDomainPrefix" "UseCloudFront=$($UseCloudFront.IsPresent.ToString().ToLowerInvariant())"
    if ($LASTEXITCODE -ne 0) {
        throw 'CloudFormation deployment failed.'
    }

    $stackJson = & aws cloudformation describe-stacks --stack-name $StackName --profile $Profile --region $Region --output json
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to read outputs for the deployed stack.'
    }
    $stack = ($stackJson | ConvertFrom-Json).Stacks[0]
    $outputs = @{}
    foreach ($output in $stack.Outputs) {
        $outputs[$output.OutputKey] = $output.OutputValue
    }

    $env:VITE_API_BASE_URL = $outputs['ApiUrl']
    $env:VITE_AUTH_DOMAIN = $outputs['AuthDomain']
    $env:VITE_USER_POOL_ID = $outputs['UserPoolId']
    $env:VITE_USER_POOL_CLIENT_ID = $outputs['UserPoolClientId']
    $env:VITE_AUTH_CALLBACK_URL = "$($outputs['WebsiteUrl'].TrimEnd('/'))/auth/callback"
    $env:VITE_AUTH_LOGOUT_URL = $outputs['WebsiteUrl']
    $env:VITE_SITE_BASE_PATH = ([Uri]$outputs['WebsiteUrl']).AbsolutePath

    & npm --prefix frontend run build
    if ($LASTEXITCODE -ne 0) {
        throw 'Frontend build failed.'
    }

    & aws s3 sync frontend/dist "s3://$($outputs['WebsiteBucketName'])/" --profile $Profile --region $Region
    if ($LASTEXITCODE -ne 0) {
        throw 'Uploading the site failed.'
    }

    if ($outputs['DistributionId']) {
        & aws cloudfront create-invalidation --distribution-id $outputs['DistributionId'] --paths '/*' --profile $Profile --region us-east-1
        if ($LASTEXITCODE -ne 0) { throw 'CloudFront invalidation failed.' }
    }

    Write-Host "Website: $($outputs['WebsiteUrl'])"
}
finally {
    foreach ($name in $frontendConfigNames) {
        [Environment]::SetEnvironmentVariable($name, $previousFrontendConfig[$name], 'Process')
    }
    Pop-Location
}
