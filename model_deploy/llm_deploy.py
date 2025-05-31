import json
import sagemaker
import boto3
from sagemaker.huggingface import HuggingFaceModel, get_huggingface_llm_image_uri
from botocore.exceptions import ClientError

def create_sagemaker_role(role_name='sagemaker_execution_role'):
    """
    Create a SageMaker execution role if it doesn't exist
    """
    iam = boto3.client('iam')
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "sagemaker.amazonaws.com"
                },
                "Action": "sts:AssumeRole"
            }
        ]
    }
    try:
        response = iam.get_role(RoleName=role_name)
        print(f"Role {role_name} already exists")
        return response['Role']['Arn']
    except ClientError as e:
        if e.response['Error']['Code'] == 'NoSuchEntity':
            print(f"Role {role_name} doesn't exist. Creating it...")
            try:
                response = iam.create_role(
                    RoleName=role_name,
                    AssumeRolePolicyDocument=json.dumps(trust_policy),
                    Description='SageMaker execution role for model deployment'
                )
                role_arn = response['Role']['Arn']
                print(f"Created role: {role_arn}")
                policies = [
                    'arn:aws:iam::aws:policy/AmazonSageMakerFullAccess',
                    'arn:aws:iam::aws:policy/AmazonS3FullAccess',
                    'arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly'
                ]
                for policy_arn in policies:
                    iam.attach_role_policy(
                        RoleName=role_name,
                        PolicyArn=policy_arn
                    )
                    print(f"Attached policy: {policy_arn}")
                print("Waiting for role to be available...")
                import time
                time.sleep(10)
                return role_arn
            except ClientError as create_error:
                print(f"Error creating role: {create_error}")
                raise
        else:
            print(f"Error getting role: {e}")
            raise
try:
    role = sagemaker.get_execution_role()
    print("Using SageMaker execution role from environment")
except ValueError:
    print("SageMaker execution role not found in environment. Checking IAM...")
    role = create_sagemaker_role()
print(f"Using role: {role}")
hub = {
    'HF_MODEL_ID': 'epfl-llm/meditron-7b',
    'SM_NUM_GPUS': json.dumps(1),
    'HF_TOKEN': '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'
}
assert hub['HF_TOKEN'] != '<REPLACE WITH YOUR TOKEN>', "You have to provide a token."
huggingface_model = HuggingFaceModel(
    image_uri=get_huggingface_llm_image_uri("huggingface", version="3.2.3"),
    env=hub,
    role=role, 
)
predictor = huggingface_model.deploy(
    initial_instance_count=1,
    instance_type="ml.g5.2xlarge",
    container_startup_health_check_timeout=300,
)
response = predictor.predict({
    "inputs": "My name is Julien and I like to",
})
print("Model response:", response)