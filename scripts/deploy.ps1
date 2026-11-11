param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Profile,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$')]
    [string]$AuthDomainPrefix,

    [string]$StackName = 'smart-temple',
    [string]$Region = 'ap-south-1'
)

$ErrorActionPreference = 'Stop'

foreach ($program in @('aws', 'sam', 'npm')) {
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

    if ($identity.Arn -match ':root$') {
        throw 'The selected profile is the AWS account root user. Create or select a dedicated deployment role before changing AWS resources.'
    }

    Write-Host "Selected AWS account: $($identity.Account)"
    Write-Host "Selected identity: $($identity.Arn)"
    $confirmation = Read-Host 'Type the account ID above to continue'
    if ($confirmation -ne $identity.Account) {
        throw 'Account ID confirmation did not match. No resources were changed.'
    }

    & sam build --template-file template.yaml
    if ($LASTEXITCODE -ne 0) {
        throw 'SAM build failed.'
    }

    & sam deploy `
        --template-file .aws-sam/build/template.yaml `
        --stack-name $StackName `
        --region $Region `
        --profile $Profile `
        --resolve-s3 `
        --capabilities CAPABILITY_IAM `
        --parameter-overrides "AuthDomainPrefix=$AuthDomainPrefix"
    if ($LASTEXITCODE -ne 0) {
        throw 'SAM deployment failed or was cancelled.'
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

    & npm --prefix frontend run build
    if ($LASTEXITCODE -ne 0) {
        throw 'Frontend build failed.'
    }

    & aws s3 sync frontend/dist "s3://$($outputs['WebsiteBucketName'])/" --delete --profile $Profile --region $Region
    if ($LASTEXITCODE -ne 0) {
        throw 'Uploading the site failed.'
    }

    & aws cloudfront create-invalidation --distribution-id $outputs['DistributionId'] --paths '/*' --profile $Profile
    if ($LASTEXITCODE -ne 0) {
        throw 'CloudFront invalidation failed.'
    }

    Write-Host "Website: $($outputs['WebsiteUrl'])"
}
finally {
    Remove-Item Env:VITE_API_BASE_URL, Env:VITE_AUTH_DOMAIN, Env:VITE_USER_POOL_ID, Env:VITE_USER_POOL_CLIENT_ID, Env:VITE_AUTH_CALLBACK_URL, Env:VITE_AUTH_LOGOUT_URL -ErrorAction SilentlyContinue
    Pop-Location
}
