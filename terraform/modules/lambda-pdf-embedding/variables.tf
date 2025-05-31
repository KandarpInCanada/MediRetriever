variable "aws_region" {
  default = "us-east-1"
}

variable "s3_bucket_name" {
  default = "pdf-embedding-bucket-unique-name"
}

variable "pinecone_api_key" {}
variable "pinecone_env_region" {
  default = "Production"
}
variable "pinecone_index" {}
variable "embedding_dim" {
  default = 768
}
variable "sagemaker_endpoint_name" {}
variable "sagemaker_endpoint_arn" {}
