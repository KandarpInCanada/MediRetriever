provider "aws" {
  region = var.aws_region
}

module "sagemaker_llm" {
  source            = "./modules/llm_sagemaker"
  huggingface_token = "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"
  model_id          = "epfl-llm/meditron-7b"
  instance_type     = "ml.g5.2xlarge"
  role_name         = "sagemaker_execution_role"
}

# module "lambda_pdf_embedding" {
#   source                  = "./modules/lambda-pdf-embedding"
#   aws_region              = var.aws_region
#   s3_bucket_name          = "pdf-embedding-bucket"
#   pinecone_api_key        = var.pinecone_api_key
#   pinecone_index          = var.pinecone_index_name
#   sagemaker_endpoint_name = module.sagemaker_embedding.pubmedbert_endpoint_name
#   sagemaker_endpoint_arn  = module.sagemaker_embedding.pubmedbert__role_arn
# }

# module "ec2_oncology_app" {
#   source        = "./modules/ec2-oncology-app"
#   aws_region    = var.aws_region
#   instance_type = var.instance_type
#   key_name      = var.key_name
#   docker_image  = "kandarpincanada/oncology-app:latest"
#   app_port      = 3000
#   environment_variables = {
#     AWS_REGION                   = var.aws_region
#     PINECONE_API_KEY             = var.pinecone_api_key
#     PINECONE_INDEX_NAME          = var.pinecone_index_name
#     SAGEMAKER_EMBEDDING_ENDPOINT = module.sagemaker_embedding.pubmedbert_endpoint_name
#     SAGEMAKER_LLM_ENDPOINT       = module.sagemaker_llm.meditron_endpoint_name
#     S3_BUCKET_NAME               = "pdf-embedding-bucket"
#   }
#   tags = {
#     Environment = "production"
#     Project     = "oncology-app"
#     Owner       = "your-team"
#   }
# }
